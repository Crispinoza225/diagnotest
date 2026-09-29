"""Tests de la note de santé, du rapport HTML et de l'analyse USB de la version PC : python -m unittest discover -s tests"""
import importlib.util
import os
import unittest
from datetime import datetime

CHEMIN = os.path.join(os.path.dirname(__file__), "..", "desktop", "diagnotest.py")
spec = importlib.util.spec_from_file_location("diagnotest", CHEMIN)
dt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dt)


def rapport(**codes):
    return {section: {"statut": dt.LABEL[code], "code": code, "donnees": {}} for section, code in codes.items()}


class TestNote(unittest.TestCase):
    def test_tout_ok(self):
        self.assertEqual(dt.note_sante(rapport(batterie="ok", cpu="ok", ram="ok"))["note"], 100)

    def test_ponderation(self):
        # batterie (poids 3) à surveiller, cpu (poids 2) OK : (60×3 + 100×2) / 5 = 76
        bilan = dt.note_sante(rapport(batterie="warn", cpu="ok"))
        self.assertEqual((bilan["note"], bilan["mention"]), (76, "Bon"))

    def test_defaut_plafonne(self):
        bilan = dt.note_sante(rapport(ram="ko", batterie="ok", cpu="ok", disques="ok", reseau="ok"))
        self.assertLessEqual(bilan["note"], 69)
        self.assertIn(bilan["mention"], ("Moyen", "Mauvais"))

    def test_reseau_ne_plafonne_pas(self):
        self.assertGreater(dt.note_sante(rapport(batterie="ok", ram="ok", reseau="ko"))["note"], 69)

    def test_info_ignore(self):
        bilan = dt.note_sante({"systeme": {"statut": "Info", "code": "info", "donnees": {}}})
        self.assertIsNone(bilan["note"])

    def test_recommandations(self):
        conseils = dt.recommandations(rapport(cpu="warn", ram="ko"))
        self.assertEqual(conseils[0][0], "ko")
        self.assertIn("MemTest86", conseils[0][1])

    def test_html_echappe(self):
        r = rapport(cpu="ok")
        r["cpu"]["donnees"]["Modèle"] = "<script>alert(1)</script>"
        html = dt.rapport_html(r, dt.note_sante(r), [], datetime(2026, 1, 1))
        self.assertIn("Rapport de diagnostic", html)
        self.assertNotIn("<script>alert", html)
        self.assertIn("&lt;script&gt;", html)


class TestUSB(unittest.TestCase):
    def test_pnp_liste(self):
        texte = ('[{"FriendlyName":"Souris USB","Status":"OK","Problem":0,"InstanceId":"USB\\\\VID_046D"},'
                 '{"FriendlyName":null,"Status":"Error","Problem":43,"InstanceId":"USB\\\\VID_0000"}]')
        appareils = dt.parse_pnp(texte)
        self.assertEqual([a["nom"] for a in appareils], ["Souris USB", "USB\\VID_0000"])
        self.assertEqual([dt.en_erreur(a) for a in appareils], [False, True])
        self.assertIn("code 43", dt.PROBLEMES_WIN[appareils[1]["probleme"]])

    def test_pnp_objet_seul_et_enum(self):
        appareils = dt.parse_pnp('{"FriendlyName":"Clé","Status":"OK","Problem":"CM_PROB_NONE","InstanceId":"USB\\\\X"}')
        self.assertEqual(len(appareils), 1)
        self.assertFalse(dt.en_erreur(appareils[0]))
        self.assertEqual(dt.parse_pnp('{"Status":"Error","Problem":"CM_PROB_FAILED_POST_START (43)"}')[0]["probleme"], 43)

    def test_pnp_vide_ou_invalide(self):
        self.assertEqual(dt.parse_pnp(""), [])
        self.assertEqual(dt.parse_pnp("pas du json"), [])

    def test_dmesg(self):
        journal = ("[1.0] usb 1-1: new high-speed USB device number 2 using xhci_hcd\n"
                   "[5.2] usb 1-2: device descriptor read/64, error -71\n"
                   "[6.0] usb usb1-port2: unable to enumerate USB device\n"
                   "[7.0] usb 1-3: USB disconnect, device number 4\n")
        erreurs = dt.erreurs_dmesg(journal)
        self.assertEqual(len(erreurs), 2)
        self.assertIn("error -71", erreurs[0])

    def test_poids_et_conseil(self):
        self.assertIn("usb", dt.POIDS)
        self.assertIn("--reparer-usb", dt.recommandations(rapport(usb="warn"))[0][1])


if __name__ == "__main__":
    unittest.main()
