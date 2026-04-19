function adjustColor(rgb) {
    function clamp(v) {
        return Math.max(0, Math.min(255, Math.round(v)));
    }

    var r = rgb.red;
    var g = rgb.green;
    var b = rgb.blue;

    // Jeśli bardzo ciemne – rozjaśnij
    if (r < 64 && g < 64 && b < 64) {
        r = clamp(r + r * 0.25);
        g = clamp(g + g * 0.25);
        b = clamp(b + b * 0.25);
    } else {
        // W przeciwnym razie – przyciemnij
        r = clamp(r - r * 0.25);
        g = clamp(g - g * 0.25);
        b = clamp(b - b * 0.25);
    }

    var newColor = new RGBColor();
    newColor.red = r;
    newColor.green = g;
    newColor.blue = b;

    return newColor;
}

function smartBorder() {
    if (app.documents.length === 0) {
        alert("Brak otwartego dokumentu.");
        return;
    }

    var sel = app.activeDocument.selection;
    if (sel.length === 0) {
        alert("Nie zaznaczono żadnych obiektów.");
        return;
    }

    for (var i = 0; i < sel.length; i++) {
        var obj = sel[i];

        if (!obj.filled || !(obj.fillColor instanceof RGBColor)) {
            continue; // Pomijamy brak wypełnienia lub inne kolory niż RGB
        }

        var fill = obj.fillColor;
        var stroke = adjustColor(fill);

        obj.stroked = true;
        obj.strokeColor = stroke;
    }
}

smartBorder();
