// Rozgrupuj zaznaczone grupy w Illustratorze
if (app.documents.length > 0) {
    var doc = app.activeDocument;
    var selection = doc.selection;

    if (selection.length > 0) {
        for (var i = 0; i < selection.length; i++) {
            var item = selection[i];
            if (item.typename === "GroupItem") {
                // Rozgrupuj grupę
                for (var j = item.pageItems.length - 1; j >= 0; j--) {
                    item.pageItems[j].move(item, ElementPlacement.PLACEAFTER);
                }
                item.remove(); // Usuń pustą grupę
            }
        }
        alert("Zakończono rozgrupowywanie.");
    } else {
        alert("Nie zaznaczono żadnych obiektów.");
    }
} else {
    alert("Brak otwartego dokumentu.");
}
