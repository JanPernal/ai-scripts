function main() {
    if (!AreDocuments()) {
        alert("Brak otwartych dokumentów.");
        return;
    }
    if (!IsSelected()) {
        alert("Najpierw zaznacz jakieś obiekty.");
        return;
    }

    var doc = app.activeDocument;
    var selectedObjects = doc.selection;

    var generatedCode = GetHexColors(selectedObjects);

    if (generatedCode === "") {
        alert("Żaden zaznaczony obiekt nie ma koloru wypełnienia.");
    } else {
        prompt("Skopiuj kolory:", generatedCode);
    }
}

function AreDocuments() {
    return app.documents.length > 0;
}

function IsSelected() {
    return app.activeDocument.selection.length > 0;
}

function GetHexColors(selectedObjects) {
    var generatedCode = "";

    for (var i = 0; i < selectedObjects.length; i++) {
        var object = selectedObjects[i];

        if (object.filled && object.fillColor.typename === "RGBColor") {
            var color = object.fillColor;
            var hexColor = RGBToHex(color);
            generatedCode += 'var color' + (i + 1) + ' = "' + hexColor + '";\n';
        }
    }

    return generatedCode;
}

function RGBToHex(color) {
    return "#" + toHex(color.red) + toHex(color.green) + toHex(color.blue);
}

function toHex(value) {
    var hex = Math.round(value).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
}

main();
