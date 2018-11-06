(function (root, data) {
    var loaded, module;

    /* Load into Cockpit locale */
    if (typeof cockpit === 'object') {
        cockpit.locale(data)
        loaded = true;
    }

    if (!loaded)
        root.po = data;

/* The syntax of this line is important  by po2json */
}(this, {
 "": {
  "language": ""
 },
 "Ceph Installer": [
  null,
  "Installationsprogramm"
 ],
 "Running on $0": [
  null,
  "Läuft auf $0"
 ],
 "Unknown": [
  null,
  "Unbekannt"
 ]
}));
