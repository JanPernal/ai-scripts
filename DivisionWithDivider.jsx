var color1 = "#493d35";
var color2 = "#253e8e";
var color3 = "#526699";
var color4 = "#1484f4";
var color5 = "#5fcdd3";
var color6 = "#cafaff";
var color7 = "#c1c1c1";
var color8 = "#efefef";
var color9 = "#ffdb76";
var color10 = "#ffeeb6";

function main() {
    if (!AreDocuments()) {
        alert("Brak otwartych dokumentów!");
        return;
    }

    var doc = app.activeDocument;
    if (!IsSomethingSelected()) {
        alert("Nic nie jest zaznaczone!");
        return;
    }

    ProcessSelectedObjects(doc);
}

function ProcessSelectedObjects(doc) {
    for (var i = doc.selection.length - 1; i >= 0; i--) {
        var object = doc.selection[i];

        if (!IsRGB(object)) {
            alert("Obiekt nr " + (doc.selection.length - i) + " nie jest RGB!");
            continue;
        }

        var hexColor = RGBToHex(object);
        var resultNumber = FindResultNumber(hexColor);
        if (resultNumber !== null) {
            HandlePathItem(doc, object, divisionExpressionFromResultAndDivisor(resultNumber, 10), i);
        }
    }
}

function HandlePathItem(doc, object, resultNumber, index) {
    if (object.typename !== "PathItem") {
        alert("Obiekt nr " + (index + 1) + " nie jest kształtem (PathItem)!");
        return;
    }

    var duplicatedObject = object.duplicate();
    AddTextToObject(doc, duplicatedObject, resultNumber, index);
}

function AddTextToObject(doc, object, resultNumber) {
    var textFrame = doc.textFrames.areaText(object);
    textFrame.contents = resultNumber;

    FormatTextFrame(textFrame);
}

function FormatTextFrame(textFrame) {
    textFrame.textRange.size = 9;
    textFrame.textRange.justification = Justification.CENTER;
    textFrame.textRange.verticalScale = 100;
    textFrame.textRange.leading = textFrame.textRange.size * 1.2;
    textFrame.textRange.baselineShift = -textFrame.textRange.size / 3;

    var blackColor = new RGBColor();
    blackColor.red = 0;
    blackColor.green = 0;
    blackColor.blue = 0;
    textFrame.textRange.fillColor = blackColor;
}

function AreDocuments() {
    return app.documents.length > 0;
}

function IsSomethingSelected() {
    return app.activeDocument.selection.length > 0;
}

function IsRGB(object) {
    return object.filled && object.fillColor && object.fillColor.typename === "RGBColor";
}

function RGBToHex(object) {
    var color = object.fillColor;
    return "#" + toHex(color.red) + toHex(color.green) + toHex(color.blue);
}

function toHex(value) {
    var hex = Math.round(value).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
}

function FindResultNumber(hexColor) {
    var upperHex = hexColor.toUpperCase();
    switch (upperHex) {
        case color1.toUpperCase(): return 1;
        case color2.toUpperCase(): return 2;
        case color3.toUpperCase(): return 3;
        case color4.toUpperCase(): return 4;
        case color5.toUpperCase(): return 5;
        case color6.toUpperCase(): return 6;
        case color7.toUpperCase(): return 7;
        case color8.toUpperCase(): return 8;
        case color9.toUpperCase(): return 9;
        case color10.toUpperCase(): return 10;
        default:
            alert("Ten kolor jest wyjątkowy: " + hexColor);
            return null;
    }
}

function randomMultiplicationString(num) {
    if (num > 100) return "Number too large";

    var divisors = [];

    // Znajdujemy dzielniki liczby oprócz 1 i samej siebie
    for (var i = 2; i <= Math.sqrt(num); i++) {
        if (num % i === 0) {
            if (i <= 10 && num / i <= 10) {
                divisors.push(i);
                if (i !== num / i) {
                    divisors.push(num / i);
                }
            }
        }
    }

    // Tworzymy pełną listę możliwych wyników
    var possibleResults = [];

    if (num <= 10) {
        possibleResults.push("1 x " + num, num + " x 1");
    }

    for (var i = 0; i < divisors.length; i++) {
        var divisor = divisors[i];
        var pair = num / divisor;
        possibleResults.push(divisor + " x " + pair);
        possibleResults.push(pair + " x " + divisor);
    }

    // Jeśli nie ma żadnych możliwości, zwracamy "1 x liczba" lub "liczba x 1"
    if (possibleResults.length === 0) {
        return Math.random() < 0.5 ? "1 x " + num : num + " x 1";
    }

    // Losujemy jeden z możliwych wyników
    return possibleResults[Math.floor(Math.random() * possibleResults.length)];
}

function multiplicationExpressionFromResultAndFactor(num, factor) {
    if (factor === 0) return "Cannot multiply by zero";

    var otherFactor = num / factor;

    // Sprawdzamy, czy wynik będzie całkowity i sensowny
    if (!Number.isInteger(otherFactor) || otherFactor > 100 || factor > 100) {
        return "Invalid input or result too large";
    }

    // Losowa kolejność mnożników
    if (Math.random() < 0.5) {
        return factor + " x " + otherFactor;
    } else {
        return otherFactor + " x " + factor;
    }
}

function divisionExpressionFromResultAndDivisor(num, divisor) {
    if (divisor === 0) return "Cannot divide by zero";

    var dividend = num * divisor;

    return dividend + " " + getDivisionSymbol() + " " + divisor;
}

function getDivisionSymbol() {
    return String.fromCharCode(247);
}



main();
