if (app.documents.length > 0) {
    var doc = app.activeDocument;
    var selection = doc.selection;

    function toHex(value) {
        var hex = Math.round(value).toString(16);
        return hex.length == 1 ? "0" + hex : hex;
    }

    if (selection.length > 0) {
        for (var i = 0; i < selection.length; i++) {
            alert("Obiekt nr " + (i + 1));
            var shape = selection[i];

            if (shape.filled && shape.fillColor.typename == "RGBColor") {
                var color = shape.fillColor;
                var hexColor = "#" + toHex(color.red) + toHex(color.green) + toHex(color.blue);
                alert("Hex color: " + hexColor);
            } else {
                alert("Nieznany kolor");
            }

            if (shape.typename == "PathItem") {
                var bestPoint = FindShapeCenter(shape);
                if (bestPoint) {
                    alert("Najbardziej oddalony punkt: X=" + bestPoint[0] + ", Y=" + bestPoint[1]);
                } else {
                    alert("Nie znaleziono odpowiedniego punktu.");
                }
            }
        }
    } else {
        alert("Nic nie jest zaznaczone!");
    }
} else {
    alert("Brak otwartego dokumentu.");
}

function FindShapeCenter(object) {
    var pathPoints = object.pathPoints;
    var maxDist = 0;
    var bestPoint = null;

    for (var j = 0; j < pathPoints.length; j++) {
        var pt = pathPoints[j].anchor;
        var minDist = Number.MAX_VALUE;

        // Znajdujemy odległość punktu od każdej krawędzi
        for (var k = 0; k < pathPoints.length; k++) {
            if (j !== k) {
                var edgePt = pathPoints[k].anchor;
                var dx = edgePt[0] - pt[0];
                var dy = edgePt[1] - pt[1];
                var dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < minDist) {
                    minDist = dist;
                }
            }
        }

        // Jeśli znaleźliśmy punkt bardziej oddalony od krawędzi – zapisujemy
        if (minDist > maxDist) {
            maxDist = minDist;
            bestPoint = pt;
        }
    }
    return bestPoint; // Zwracamy najlepszy punkt zamiast używać globalnej zmiennej
}
