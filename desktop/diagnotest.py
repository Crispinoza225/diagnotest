#!/usr/bin/env python3
"""DiagnoTest Desktop — diagnostic matériel approfondi pour PC (Windows, Linux, macOS).

Complète la version web avec ce qu'un navigateur ne peut pas mesurer :
usure réelle de la batterie, santé et vitesse des disques, températures,
fréquences CPU, modèle exact du processeur et de la carte graphique.

Utilisation :
    python diagnotest.py              # tous les tests
    python diagnotest.py --quick      # tests rapides (sans stress ni disque)
    python diagnotest.py --only cpu ram
    python diagnotest.py --help
"""
from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import os
import platform
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from datetime import datetime

try:
    import psutil
except ImportError:  # le script fonctionne en mode dégradé sans psutil
    psutil = None

__version__ = "1.2.0"

IS_WIN, IS_LINUX, IS_MAC = sys.platform == "win32", sys.platform.startswith("linux"), sys.platform == "darwin"

# --------------------------------------------------------------------------- #
# Affichage                                                                   #
# --------------------------------------------------------------------------- #
if IS_WIN:
    os.system("")  # active les séquences ANSI dans la console Windows
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

C = {"ok": "\033[92m", "warn": "\033[93m", "ko": "\033[91m", "info": "\033[94m", "b": "\033[1m", "dim": "\033[2m", "0": "\033[0m"}
ICON = {"ok": "✔", "warn": "⚠", "ko": "✖", "info": "ℹ"}
LABEL = {"ok": "OK", "warn": "À surveiller", "ko": "Défaut", "info": "Info"}
REPORT: dict[str, dict] = {}


def title(text: str) -> None:
    print(f"\n{C['b']}━━ {text} {'━' * max(0, 60 - len(text))}{C['0']}")


def line(key: str, value) -> None:
    print(f"\r\033[K  {C['dim']}{key:<28}{C['0']} {value}")


def verdict(section: str, status: str, data: dict) -> None:
    REPORT[section] = {"statut": LABEL[status], "donnees": data}
    print(f"  {C[status]}{ICON[status]} {LABEL[status]}{C['0']}")


def run(cmd: list[str] | str, timeout: int = 30) -> str:
    """Exécute une commande système et renvoie sa sortie (chaîne vide en cas d'échec)."""
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout,
                              shell=isinstance(cmd, str), errors="replace").stdout.strip()
    except Exception:
        return ""


def ps(command: str) -> str:
    return run(["powershell", "-NoProfile", "-NonInteractive", "-Command", command])


def gb(n: float) -> str:
    return f"{n / 1024 ** 3:.1f} Go"


# --------------------------------------------------------------------------- #
# Système                                                                     #
# --------------------------------------------------------------------------- #
def cpu_model() -> str:
    if IS_WIN:
        return ps("(Get-CimInstance Win32_Processor).Name") or platform.processor()
    if IS_MAC:
        return run(["sysctl", "-n", "machdep.cpu.brand_string"]) or platform.processor()
    try:
        with open("/proc/cpuinfo") as f:
            m = re.search(r"model name\s*:\s*(.+)", f.read())
            return m.group(1) if m else platform.processor()
    except OSError:
        return platform.processor()


def gpu_models() -> list[str]:
    if IS_WIN:
        rows = ps("Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name + '|' + [math]::Round($_.AdapterRAM/1GB,1) + '|' + $_.DriverVersion }")
        # Le texte accentué est ajouté côté Python : la ligne de commande PowerShell corrompt les accents.
        out = "\n".join(f"{n} | {r} Go (valeur WMI, plafonnée à 4 Go) | pilote {d}"
                        for n, r, d in (l.split("|") for l in rows.splitlines() if l.count("|") == 2))
    elif IS_MAC:
        out = run("system_profiler SPDisplaysDataType | grep 'Chipset Model'")
    else:
        out = run("lspci | grep -Ei 'vga|3d|display'")
    return [l.strip() for l in out.splitlines() if l.strip()] or ["Non détecté"]


def os_name() -> str:
    if IS_WIN:
        build = int(platform.version().split(".")[-1] or 0)
        return f"Windows {'11' if build >= 22000 else platform.release()} (build {build})"
    if IS_MAC:
        return f"macOS {platform.mac_ver()[0]}"
    try:
        with open("/etc/os-release") as f:
            m = re.search(r'PRETTY_NAME="(.+)"', f.read())
            if m:
                return m.group(1)
    except OSError:
        pass
    return f"{platform.system()} {platform.release()}"


def test_system() -> None:
    title("Informations système")
    data = {
        "Système": os_name(),
        "Machine": platform.node(),
        "Architecture": platform.machine(),
        "Processeur": cpu_model(),
    }
    if not getattr(sys, "frozen", False):  # sans intérêt dans le .exe
        data["Python"] = platform.python_version()
    if IS_WIN:
        data["Fabricant / modèle"] = ps("$c=Get-CimInstance Win32_ComputerSystem; $c.Manufacturer + ' ' + $c.Model")
        data["Numéro de série"] = ps("(Get-CimInstance Win32_BIOS).SerialNumber")
        data["BIOS"] = ps("$b=Get-CimInstance Win32_BIOS; $b.Manufacturer + ' ' + $b.SMBIOSBIOSVersion")
    if psutil:
        data["Démarré depuis"] = f"{(time.time() - psutil.boot_time()) / 3600:.1f} h"
    for i, g in enumerate(gpu_models()):
        data[f"GPU {i + 1}"] = g
    for k, v in data.items():
        line(k, v)
    verdict("systeme", "info", data)


# --------------------------------------------------------------------------- #
# Batterie                                                                    #
# --------------------------------------------------------------------------- #
def battery_capacity() -> tuple[float | None, float | None, int | None]:
    """Renvoie (capacité d'origine, capacité actuelle max, nombre de cycles) en mWh."""
    if IS_WIN:
        path = os.path.join(tempfile.gettempdir(), "diagnotest_battery.xml")
        run(["powercfg", "/batteryreport", "/xml", "/output", path], timeout=60)
        try:
            with open(path, encoding="utf-8", errors="replace") as f:
                xml = f.read()
            os.remove(path)
            design = re.search(r"<DesignCapacity>(\d+)</DesignCapacity>", xml)
            full = re.search(r"<FullChargeCapacity>(\d+)</FullChargeCapacity>", xml)
            cycles = re.search(r"<CycleCount>(\d+)</CycleCount>", xml)
            return (float(design.group(1)) if design else None, float(full.group(1)) if full else None,
                    int(cycles.group(1)) if cycles else None)
        except OSError:
            return None, None, None
    if IS_LINUX:
        for bat in ("BAT0", "BAT1", "battery"):
            base = f"/sys/class/power_supply/{bat}/"
            for design_f, full_f in (("energy_full_design", "energy_full"), ("charge_full_design", "charge_full")):
                try:
                    with open(base + design_f) as d, open(base + full_f) as fu:
                        cycles = None
                        if os.path.exists(base + "cycle_count"):
                            with open(base + "cycle_count") as c:
                                cycles = int(c.read().strip() or 0) or None
                        return float(d.read()) / 1000, float(fu.read()) / 1000, cycles
                except OSError:
                    continue
    if IS_MAC:
        out = run("ioreg -r -c AppleSmartBattery")
        design = re.search(r'"DesignCapacity" = (\d+)', out)
        full = re.search(r'"AppleRawMaxCapacity" = (\d+)', out) or re.search(r'"MaxCapacity" = (\d+)', out)
        cycles = re.search(r'"CycleCount" = (\d+)', out)
        if design and full:
            return float(design.group(1)), float(full.group(1)), int(cycles.group(1)) if cycles else None
    return None, None, None


def test_battery() -> None:
    title("Batterie")
    bat = psutil.sensors_battery() if psutil else None
    design, full, cycles = battery_capacity()
    if not bat and not design:
        line("Statut", "Aucune batterie détectée (PC fixe ?)")
        verdict("batterie", "info", {"Statut": "Aucune batterie"})
        return
    data: dict = {}
    if bat:
        data["Niveau"] = f"{bat.percent:.0f} %"
        data["Secteur branché"] = "Oui" if bat.power_plugged else "Non"
        if not bat.power_plugged and bat.secsleft not in (psutil.POWER_TIME_UNLIMITED, psutil.POWER_TIME_UNKNOWN):
            data["Autonomie restante"] = f"{bat.secsleft // 3600} h {bat.secsleft % 3600 // 60:02d}"
    status = "ok"
    if design and full:
        health = full / design * 100
        data["Capacité d'origine"] = f"{design / 1000:.1f} Wh"
        data["Capacité actuelle max"] = f"{full / 1000:.1f} Wh"
        data["Santé (usure)"] = f"{health:.0f} % (usure {max(0, 100 - health):.0f} %)"
        if health < 60:
            status = "ko"
            data["Diagnostic"] = "Batterie très usée : remplacement conseillé."
        elif health < 80:
            status = "warn"
            data["Diagnostic"] = "Usure notable : autonomie réduite."
        else:
            data["Diagnostic"] = "Bonne santé."
    else:
        data["Santé"] = "Capacités non disponibles sur ce système"
    if cycles:
        data["Cycles de charge"] = cycles
    for k, v in data.items():
        line(k, v)
    verdict("batterie", status, data)


# --------------------------------------------------------------------------- #
# CPU                                                                         #
# --------------------------------------------------------------------------- #
def _work(seconds: float) -> int:
    """Charge de calcul entière + flottante ; renvoie le nombre de blocs effectués."""
    end, n = time.perf_counter() + seconds, 0
    while time.perf_counter() < end:
        x, y = 123456789, 0.0
        for i in range(1, 20001):
            x = (x * 1103515245 + 12345) & 0xFFFFFFFF
            y += (i ** 0.5) * ((x >> 16) & 255)
        n += 1
    return n


def cpu_temp() -> float | None:
    if psutil and hasattr(psutil, "sensors_temperatures"):
        try:
            temps = psutil.sensors_temperatures()
            for key in ("coretemp", "k10temp", "zenpower", "cpu_thermal", "acpitz"):
                if temps.get(key):
                    return max(t.current for t in temps[key])
        except Exception:
            pass
    if IS_WIN:  # nécessite souvent les droits administrateur
        out = ps("(Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue | "
                 "Select-Object -First 1).CurrentTemperature")
        if out.strip().isdigit():
            return int(out) / 10 - 273.15
    return None


def test_cpu(stress_seconds: int) -> None:
    title("Processeur (CPU)")
    logical = os.cpu_count() or 1
    physical = psutil.cpu_count(logical=False) if psutil else None
    if not physical and IS_WIN:
        physical = ps("(Get-CimInstance Win32_Processor | Measure-Object NumberOfCores -Sum).Sum") or None
    data = {"Modèle": cpu_model(), "Cœurs physiques": physical or "—", "Threads": logical}
    if psutil and psutil.cpu_freq():
        f = psutil.cpu_freq()
        data["Fréquence"] = f"{f.current:.0f} MHz (max {f.max:.0f} MHz)" if f.max else f"{f.current:.0f} MHz"
    for k, v in data.items():
        line(k, v)

    print(f"  {C['dim']}Benchmark mono-cœur (3 s)…{C['0']}", end="\r")
    # Meilleur de 3 essais d'1 s : sur les CPU hybrides (P-cores/E-cores), le système
    # peut placer un essai sur un cœur économe, ce qui fausserait une mesure unique.
    single = max(_work(1) for _ in range(3))
    print(f"  {C['dim']}Benchmark multi-cœurs (3 s)…{C['0']}", end="\r")
    with mp.Pool(logical) as pool:
        multi = sum(pool.map(_work, [3] * logical)) / 3
    data["Score mono-cœur"] = f"{single:.1f} pts"
    data["Score multi-cœurs"] = f"{multi:.1f} pts"
    data["Efficacité multi-cœurs"] = f"×{multi / single:.1f} (idéal ×{logical})"
    for k in ("Score mono-cœur", "Score multi-cœurs", "Efficacité multi-cœurs"):
        line(k, data[k])

    status = "ok"
    if stress_seconds:
        t0 = cpu_temp()
        print(f"  {C['dim']}Stress test {stress_seconds} s sur {logical} threads…{C['0']}")
        with mp.Pool(logical) as pool:
            res = pool.map_async(_work, [stress_seconds] * logical)
            peak_temp, freqs = t0, []
            while not res.ready():
                time.sleep(2)
                t = cpu_temp()
                if t is not None:
                    peak_temp = max(peak_temp or t, t)
                if psutil and psutil.cpu_freq():
                    freqs.append(psutil.cpu_freq().current)
            res.get()
        if t0 is not None:
            data["Température repos → pic"] = f"{t0:.0f} °C → {peak_temp:.0f} °C"
            if peak_temp and peak_temp >= 95:
                status = "ko"
                data["Diagnostic"] = "Surchauffe ! Nettoyez les ventilateurs / changez la pâte thermique."
            elif peak_temp and peak_temp >= 85:
                status = "warn"
                data["Diagnostic"] = "Températures élevées sous charge."
        else:
            data["Température"] = "Non lisible (lancez en administrateur, ou utilisez HWiNFO)"
        if len(freqs) >= 4:
            first, last = sum(freqs[:2]) / 2, sum(freqs[-2:]) / 2
            data["Fréquence début → fin"] = f"{first:.0f} → {last:.0f} MHz"
            if last < first * 0.75:
                status = "warn"
                data["Diagnostic"] = data.get("Diagnostic", "") + " Baisse de fréquence : throttling thermique probable."
        for k in ("Température repos → pic", "Température", "Fréquence début → fin", "Diagnostic"):
            if k in data:
                line(k, data[k])
    verdict("cpu", status, data)


# --------------------------------------------------------------------------- #
# RAM                                                                         #
# --------------------------------------------------------------------------- #
def test_ram(test_mb: int) -> None:
    title("Mémoire (RAM)")
    data: dict = {}
    if psutil:
        vm = psutil.virtual_memory()
        data["Totale"] = gb(vm.total)
        data["Disponible"] = f"{gb(vm.available)} ({100 - vm.percent:.0f} %)"
        test_mb = min(test_mb, int(vm.available / 1024 ** 2 * 0.5))  # jamais plus de 50 % du libre
    if IS_WIN:
        sticks = ps("Get-CimInstance Win32_PhysicalMemory | ForEach-Object { [string]([math]::Round($_.Capacity/1GB)) + ' Go ' + "
                    "$_.Speed + ' MHz ' + $_.Manufacturer + ' ' + $_.PartNumber.Trim() }")
        for i, s in enumerate(sticks.splitlines()):
            data[f"Barrette {i + 1}"] = s.strip()
    for k, v in data.items():
        line(k, v)

    # Écrit des motifs alternés (0xA5/0x5A, 0x00/0xFF) puis compare octet par octet.
    size, errors = test_mb * 1024 ** 2, 0
    print(f"  {C['dim']}Test de {test_mb} Mo…{C['0']}", end="\r")
    t_write = t_read = 0.0
    for pat in (b"\xa5\x5a", b"\x00\xff", b"\xff\x00"):
        t = time.perf_counter()
        buf = bytearray(pat * (size // 2))
        t_write += time.perf_counter() - t
        t = time.perf_counter()
        expected = pat * (size // 2)
        if buf != expected:
            errors += sum(1 for a, b in zip(buf, expected) if a != b)
        t_read += time.perf_counter() - t
        del buf, expected
    data["Mémoire testée"] = f"{test_mb} Mo × 3 motifs"
    data["Débit écriture"] = f"{size * 3 / t_write / 1e9:.2f} Go/s"
    data["Débit lecture/comparaison"] = f"{size * 3 / t_read / 1e9:.2f} Go/s"
    data["Erreurs"] = errors
    for k in ("Mémoire testée", "Débit écriture", "Débit lecture/comparaison", "Erreurs"):
        line(k, data[k])
    if errors:
        line("Diagnostic", "Erreurs mémoire : lancez MemTest86 pour confirmer.")
    verdict("ram", "ko" if errors else "ok", data)


# --------------------------------------------------------------------------- #
# Disques                                                                     #
# --------------------------------------------------------------------------- #
def test_disks(bench_mb: int) -> None:
    title("Stockage (disques)")
    data: dict = {}
    status = "ok"
    if IS_WIN:
        rows = ps("Get-PhysicalDisk | ForEach-Object { $_.FriendlyName + '|' + $_.MediaType + '|' + "
                  "[math]::Round($_.Size/1GB) + '|' + $_.HealthStatus }")
        out = "\n".join(f"{n} | {t} | {s} Go | santé : {h}"
                        for n, t, s, h in (l.split("|") for l in rows.splitlines() if l.count("|") == 3))
        for i, d in enumerate(out.splitlines()):
            data[f"Disque {i + 1}"] = d.strip()
            if "Unhealthy" in d:
                status = "ko"
            elif "Warning" in d and status != "ko":
                status = "warn"
    elif shutil.which("lsblk"):
        for i, d in enumerate(run("lsblk -dno NAME,MODEL,SIZE,ROTA").splitlines()):
            data[f"Disque {i + 1}"] = d.strip() + " (ROTA 1 = HDD)"
    if psutil:
        for p in psutil.disk_partitions(all=False):
            try:
                u = psutil.disk_usage(p.mountpoint)
            except (PermissionError, OSError):
                continue
            data[f"Partition {p.mountpoint}"] = f"{gb(u.used)} / {gb(u.total)} utilisés ({u.percent:.0f} %)"
            if u.percent > 95 and status == "ok":
                status = "warn"
    if shutil.which("smartctl"):
        data["SMART"] = "smartctl disponible : lancez « smartctl -a /dev/sdX » pour le détail"
    for k, v in data.items():
        line(k, v)

    if bench_mb:
        path = os.path.join(tempfile.gettempdir(), "diagnotest_disk.bin")
        block = os.urandom(4 * 1024 ** 2)
        print(f"  {C['dim']}Écriture séquentielle de {bench_mb} Mo…{C['0']}", end="\r")
        try:
            t = time.perf_counter()
            with open(path, "wb", buffering=0) as f:
                for _ in range(bench_mb // 4):
                    f.write(block)
                os.fsync(f.fileno())
            w = bench_mb / (time.perf_counter() - t)
            t = time.perf_counter()
            with open(path, "rb", buffering=0) as f:
                while f.read(4 * 1024 ** 2):
                    pass
            r = bench_mb / (time.perf_counter() - t)
            data["Écriture séquentielle"] = f"{w:.0f} Mo/s"
            data["Lecture séquentielle"] = f"{r:.0f} Mo/s (peut être gonflée par le cache)"
            if w < 30:
                status = "warn" if status == "ok" else status
                data["Diagnostic"] = "Écriture lente : disque dur mécanique ancien ou défaillant ?"
        except OSError as e:
            data["Benchmark"] = f"Impossible : {e}"
        finally:
            try:
                os.remove(path)
            except OSError:
                pass
        for k in ("Écriture séquentielle", "Lecture séquentielle", "Diagnostic", "Benchmark"):
            if k in data:
                line(k, data[k])
    verdict("disques", status, data)


# --------------------------------------------------------------------------- #
# Réseau                                                                      #
# --------------------------------------------------------------------------- #
def test_network() -> None:
    title("Réseau")
    data: dict = {}
    if psutil:
        stats = psutil.net_if_stats()
        for name, addrs in psutil.net_if_addrs().items():
            st = stats.get(name)
            if not st or not st.isup:
                continue
            ipv4 = next((a.address for a in addrs if a.family == socket.AF_INET), None)
            if ipv4 and not ipv4.startswith("127."):
                speed = f", {st.speed} Mbit/s" if st.speed else ""
                data[f"Interface {name}"] = f"{ipv4}{speed}"
    # Plusieurs serveurs : certains réseaux (entreprise, pare-feu) en bloquent un ou deux.
    latencies, target, last_error = [], None, None
    for host, port in (("1.1.1.1", 443), ("8.8.8.8", 53), ("github.com", 443), ("www.google.com", 80)):
        for _ in range(5):
            t = time.perf_counter()
            try:
                with socket.create_connection((host, port), timeout=3):
                    latencies.append((time.perf_counter() - t) * 1000)
            except OSError as e:
                last_error = e
                break
        if latencies:
            target = host
            break
    if latencies:
        latencies.sort()
        data["Internet"] = "Connecté"
        data[f"Latence (TCP {target})"] = f"{latencies[len(latencies) // 2]:.0f} ms"
        status = "ok" if latencies[len(latencies) // 2] < 150 else "warn"
    else:
        # WinError 10013 / EACCES : la connexion est refusée localement (pare-feu, antivirus), pas par le réseau.
        blocked = getattr(last_error, "winerror", None) == 10013 or getattr(last_error, "errno", None) == 13
        data["Internet"] = ("Connexion bloquée pour ce programme par le pare-feu ou l'antivirus" if blocked
                            else f"Pas de connexion ({last_error})" if last_error else "Pas de connexion")
        status = "warn" if blocked else "ko"  # le matériel réseau n'est pas en cause
    try:
        socket.gethostbyname("github.com")
        data["DNS"] = "OK"
    except OSError:
        data["DNS"] = "Échec de résolution"
        status = "ko"
    for k, v in data.items():
        line(k, v)
    verdict("reseau", status, data)


# --------------------------------------------------------------------------- #
# Programme principal                                                         #
# --------------------------------------------------------------------------- #
TESTS = ["system", "battery", "cpu", "ram", "disk", "network"]


def main() -> None:
    parser = argparse.ArgumentParser(description="DiagnoTest Desktop — diagnostic matériel du PC.")
    parser.add_argument("--only", nargs="+", choices=TESTS, help="lancer seulement certains tests")
    parser.add_argument("--quick", action="store_true", help="pas de stress test ni de benchmark disque")
    parser.add_argument("--stress", type=int, default=60, help="durée du stress CPU en secondes (défaut 60, 0 = aucun)")
    parser.add_argument("--ram-mb", type=int, default=1024, help="quantité de RAM à tester en Mo (défaut 1024)")
    parser.add_argument("--disk-mb", type=int, default=512, help="taille du fichier de benchmark disque (défaut 512)")
    parser.add_argument("--output", default=".", help="dossier où enregistrer le rapport")
    parser.add_argument("--version", action="version", version=f"DiagnoTest Desktop {__version__}")
    args = parser.parse_args()
    if args.quick:
        args.stress, args.disk_mb, args.ram_mb = 0, 0, min(args.ram_mb, 256)

    print(f"{C['b']}DiagnoTest Desktop {__version__}{C['0']} — {datetime.now():%d/%m/%Y %H:%M}")
    if not args.quick and not args.only:
        print(f"{C['dim']}Diagnostic complet : environ {args.stress // 60 + 1} à {args.stress // 60 + 2} minutes. "
              f"Ctrl+C pour interrompre, --quick pour un test rapide.{C['0']}")
    if not psutil:
        print(f"{C['warn']}⚠ Module psutil absent : certains tests seront limités. Installez-le : pip install psutil{C['0']}")

    selected = args.only or TESTS
    runners = {
        "system": test_system,
        "battery": test_battery,
        "cpu": lambda: test_cpu(args.stress),
        "ram": lambda: test_ram(args.ram_mb),
        "disk": lambda: test_disks(args.disk_mb),
        "network": test_network,
    }
    for name in TESTS:
        if name in selected:
            try:
                runners[name]()
            except KeyboardInterrupt:
                print("\nInterrompu.")
                break
            except Exception as e:  # un test qui plante ne doit pas arrêter les autres
                print(f"  {C['ko']}Erreur pendant le test : {e}{C['0']}")
                REPORT[name] = {"statut": "Erreur", "donnees": {"erreur": str(e)}}

    title("Bilan")
    counts = {s: sum(1 for r in REPORT.values() if r["statut"] == LABEL[s]) for s in ("ok", "warn", "ko")}
    print(f"\r\033[K  {C['ok']}{counts['ok']} OK{C['0']} · {C['warn']}{counts['warn']} à surveiller{C['0']} · {C['ko']}{counts['ko']} défaut(s){C['0']}")

    os.makedirs(args.output, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
    base = os.path.join(args.output, f"diagnotest-{platform.node()}-{stamp}")
    with open(base + ".json", "w", encoding="utf-8") as f:
        json.dump({"date": datetime.now().isoformat(), "machine": platform.node(), "resultats": REPORT}, f, ensure_ascii=False, indent=2)
    with open(base + ".txt", "w", encoding="utf-8") as f:
        f.write(f"RAPPORT DIAGNOTEST DESKTOP — {datetime.now():%d/%m/%Y %H:%M}\n\n")
        for sec, r in REPORT.items():
            f.write(f"■ {sec.upper()} — {r['statut']}\n")
            for k, v in r["donnees"].items():
                f.write(f"    {k} : {v}\n")
            f.write("\n")
    print(f"\n  Rapport enregistré : {base}.txt / .json")


if __name__ == "__main__":
    mp.freeze_support()  # nécessaire si le script est empaqueté en .exe (PyInstaller)
    try:
        main()
    finally:
        # Lancé par double-clic, l'exécutable ferait disparaître la fenêtre avant qu'on lise les résultats.
        if getattr(sys, "frozen", False) and len(sys.argv) == 1:
            try:
                input("\nAppuyez sur Entrée pour fermer…")
            except (EOFError, KeyboardInterrupt):
                pass
