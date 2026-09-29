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

__version__ = "1.3.0"

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
    REPORT[section] = {"statut": LABEL[status], "code": status, "donnees": data}
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
# Note de santé, recommandations et rapport HTML                              #
# --------------------------------------------------------------------------- #
# Mêmes règles que la version web (js/bilan.js) : OK = 100, à surveiller = 60, défaut = 0, pondérés ;
# un défaut matériel plafonne la note à 69 (au mieux « Moyen »). Une absence de réseau n'est pas une panne.
POIDS = {"batterie": 3, "ram": 3, "disques": 3, "cpu": 2, "reseau": 1}
VALEUR = {"ok": 100, "warn": 60, "ko": 0}
MENTIONS = ((90, "Excellent"), (75, "Bon"), (50, "Moyen"), (0, "Mauvais"))
CONSEILS = {
    "batterie": {"ko": "Batterie très usée : prévoyez son remplacement.",
                 "warn": "Batterie usée : autonomie réduite, son remplacement améliorera nettement l'ordinateur."},
    "cpu": {"ko": "Le processeur surchauffe fortement : nettoyez les aérations et le ventilateur, et faites changer la pâte thermique.",
            "warn": "Le processeur ralentit sous la charge (surchauffe) : nettoyez les aérations et le ventilateur."},
    "ram": {"ko": "Erreurs mémoire : barrette défectueuse probable. Confirmez avec MemTest86 avant de la remplacer."},
    "disques": {"ko": "Disque en mauvaise santé : sauvegardez vos données sans attendre et prévoyez son remplacement.",
                "warn": "Disque à surveiller (lent ou presque plein) : libérez de l'espace et sauvegardez vos données."},
    "reseau": {"ko": "Pas de connexion pendant le test : vérifiez le câble, le Wi-Fi ou le pare-feu.",
               "warn": "Connexion lente, ou bloquée pour ce programme par le pare-feu ou l'antivirus."},
}


def note_sante(report: dict) -> dict:
    somme = poids = 0
    evalues, defauts = [], []
    for section, r in report.items():
        code = r.get("code")
        if section not in POIDS or code not in VALEUR:
            continue
        somme += VALEUR[code] * POIDS[section]
        poids += POIDS[section]
        evalues.append(section)
        if code == "ko":
            defauts.append(section)
    if not poids:
        return {"note": None, "mention": "Pas de résultat", "evalues": 0, "total": len(POIDS)}
    note = round(somme / poids)
    if any(d != "reseau" for d in defauts):
        note = min(note, 69)
    mention = next(m for seuil, m in MENTIONS if note >= seuil)
    return {"note": note, "mention": mention, "evalues": len(evalues), "total": len(POIDS)}


def recommandations(report: dict) -> list[tuple[str, str]]:
    liste = []
    for section in POIDS:
        code = report.get(section, {}).get("code")
        if code in ("ko", "warn"):
            texte = CONSEILS[section].get(code) or CONSEILS[section]["ko"]
            liste.append((code, texte))
    return sorted(liste, key=lambda c: c[0] != "ko")


def rapport_html(report: dict, bilan: dict, conseils: list, quand: datetime) -> str:
    from html import escape
    couleurs = {"ok": "#16a34a", "warn": "#d97706", "ko": "#dc2626", "info": "#6d4aff"}
    lignes = []
    for section, r in report.items():
        details = "<br>".join(f"{escape(str(k))} : {escape(str(v))}" for k, v in r["donnees"].items())
        couleur = couleurs.get(r.get("code"), "#555")
        lignes.append(f'<tr><td>{escape(section.capitalize())}</td><td><b style="color:{couleur}">{escape(r["statut"])}</b></td><td>{details}</td></tr>')
    liste = "".join(f'<li class="{c}">{escape(t)}</li>' for c, t in conseils) or "<li>Aucun problème détecté sur les tests effectués.</li>"
    note = "—" if bilan["note"] is None else bilan["note"]
    return f"""<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rapport DiagnoTest — {escape(platform.node())}</title><style>
body{{font:14px/1.5 system-ui,"Segoe UI",Roboto,sans-serif;color:#1a1a19;max-width:900px;margin:0 auto;padding:28px}}
header{{display:flex;justify-content:space-between;align-items:center;gap:20px;border-bottom:2px solid #1a1a19;padding-bottom:14px}}
h1{{font:400 30px/1.1 Georgia,serif;margin:6px 0 4px}}header p{{margin:0;color:#6b6a66}}
.note{{text-align:center;border:2px solid #1a1a19;border-radius:18px;padding:10px 18px}}.note b{{font:400 44px/1 Georgia,serif;display:block}}
h2{{font:400 20px/1.2 Georgia,serif;margin:22px 0 8px}}table{{width:100%;border-collapse:collapse}}
td{{text-align:left;vertical-align:top;padding:7px 8px;border-bottom:1px solid #e5e4e0}}td:first-child{{font-weight:600;width:18%}}
td:nth-child(2){{width:14%}}td:last-child{{font-size:13px;color:#444}}li.ko{{color:#b91c1c}}li.warn{{color:#92400e}}
footer{{margin-top:24px;color:#6b6a66;font-size:12px}}</style></head><body>
<header><div><b style="color:#6d4aff">DIAGNOTEST DESKTOP {__version__}</b><h1>Rapport de diagnostic</h1>
<p>{escape(platform.node())} · {quand:%d/%m/%Y %H:%M}</p></div>
<div class="note"><b>{note}</b>/ 100<br><strong>{escape(bilan["mention"])}</strong></div></header>
<p>{bilan["evalues"]} tests évalués sur {bilan["total"]}.</p>
<h2>Résultats</h2><table>{"".join(lignes)}</table>
<h2>Recommandations</h2><ul>{liste}</ul>
<footer>Généré localement par DiagnoTest Desktop. Ce rapport décrit l'état constaté au moment du test.</footer></body></html>"""


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
    bilan, conseils = note_sante(REPORT), recommandations(REPORT)
    if bilan["note"] is not None:
        couleur = C["ok"] if bilan["note"] >= 75 else C["warn"] if bilan["note"] >= 50 else C["ko"]
        print(f"  {C['b']}Note de santé : {couleur}{bilan['note']}/100 ({bilan['mention']}){C['0']}"
              f" {C['dim']}— {bilan['evalues']} tests évalués sur {bilan['total']}{C['0']}")
    for code, texte in conseils:
        print(f"  {C[code]}{ICON[code]}{C['0']} {texte}")

    os.makedirs(args.output, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
    base = os.path.join(args.output, f"diagnotest-{platform.node()}-{stamp}")
    with open(base + ".json", "w", encoding="utf-8") as f:
        json.dump({"date": datetime.now().isoformat(), "machine": platform.node(), "version": __version__,
                   "note": bilan["note"], "mention": bilan["mention"], "recommandations": [t for _, t in conseils],
                   "resultats": REPORT}, f, ensure_ascii=False, indent=2)
    with open(base + ".txt", "w", encoding="utf-8") as f:
        f.write(f"RAPPORT DIAGNOTEST DESKTOP — {datetime.now():%d/%m/%Y %H:%M}\n")
        if bilan["note"] is not None:
            f.write(f"Note de santé : {bilan['note']}/100 ({bilan['mention']}) — {bilan['evalues']} tests évalués sur {bilan['total']}\n")
        f.write("\n")
        for sec, r in REPORT.items():
            f.write(f"■ {sec.upper()} — {r['statut']}\n")
            for k, v in r["donnees"].items():
                f.write(f"    {k} : {v}\n")
            f.write("\n")
        if conseils:
            f.write("RECOMMANDATIONS\n" + "".join(f"  - {t}\n" for _, t in conseils))
    with open(base + ".html", "w", encoding="utf-8") as f:
        f.write(rapport_html(REPORT, bilan, conseils, datetime.now()))
    print(f"\n  Rapport enregistré : {base}.txt / .json / .html (à ouvrir dans le navigateur, imprimable en PDF)")


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
