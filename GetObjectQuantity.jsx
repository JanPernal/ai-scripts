function main() {
    var doc = app.activeDocument;
    if (doc.selection.length <= 0) {
        alert("Nic nie jest zaznaczone!");
        return;
    }

    alert(doc.selection.length);
}
main();