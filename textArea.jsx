if (app.documents.length > 0) {
    var doc = app.activeDocument;
    var selection = doc.selection;

    if (selection.length > 0) {
        for (var i = 0; i < selection.length; i++) {
            var shape = selection[i];

            if (shape.typename == "PathItem") {
                // Duplikacja kształtu
                var duplicatedShape = shape.duplicate();

                var textFrame = doc.textFrames.areaText(duplicatedShape); // Tworzy AreaType na duplikacie
                textFrame.contents = "+";

                // Opcjonalne formatowanie tekstu
                textFrame.textRange.size = 10; // Rozmiar czcionki
                textFrame.textRange.justification = Justification.CENTER; // Wyśrodkowanie tekstu
                textFrame.textRange.verticalScale = 100; // Ustawienie na środek pionowo// Opcjonalnie ustawienie czcionki

                // Ustawienie wyrównania tekstu wewnątrz obszaru tekstowego na środek
                textFrame.textRange.leading = textFrame.textRange.size * 1.2; // Dopasowanie odległości między liniami
                textFrame.textRange.baselineShift = -textFrame.textRange.size / 3; // Korekta pionowego środka

                // Ustawienie koloru tekstu na czarny
                var blackColor = new RGBColor();
                blackColor.red = 0;
                blackColor.green = 0;
                blackColor.blue = 0;
                textFrame.textRange.fillColor = blackColor;

                alert("Dodano tekst do obiektu nr " + (i + 1));
            } else {
                alert("Obiekt nr " + (i + 1) + " nie jest kształtem (PathItem)!");
            }
        }
    } else {
        alert("Nic nie jest zaznaczone!");
    }
} else {
    alert("Brak otwartego dokumentu.");
}
