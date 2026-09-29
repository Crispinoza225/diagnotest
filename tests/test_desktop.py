"""Tests de la note de santé et du rapport HTML de la version PC : python -m unittest discover -s tests"""
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


if __name__ == "__main__":
    unittest.main()
