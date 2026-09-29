## Contribuer

### Débugguer localement

Il est possible de tester localement tout ajout de code.

Sur Chrome :

- Aller dans les paramètres de Chrome > Plus d'outils > Extensions. Activer le Mode Développeur.
- Cliquer sur "Chargez l'extension non empaquetée" et sélectionner le dossier où se trouve le code source.

Sur Firefox :

- Aller dans Extensions et thèmes > Déboguer des modules > Charger un module complémentaire temporaire
- Sélectionner le manifestV2

### Tests unitaires

Pour lancer les tests, il suffit d'ouvrir le fichier SpecRunner.html avec Chrome.  
Pour éviter un problème de CORS, lancer Chrome en désactivant la sécurité :

```
google-chrome --disable-web-security --user-data-dir
```

### Tests manuels

Ouvrir dans Google Chrome les pages test1.html, test2.html et test3.html situées dans le répertoire tests/Manual/.
Lancer l'outil d'analyse pour chaque page et vérifier que les résultats correspondent à ce qui est indiqué sur la page.

## Questions & anomalies

Pour toutes anomalies ou questions, vous pouvez poster une issue ou contacter didierfred@gmail.com
