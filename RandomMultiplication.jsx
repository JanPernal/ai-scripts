var color1 = "#ece8ef";
var color2 = "#ffe000";
var color3 = "#ffae1f";
var color4 = "#e07319";
var color5 = "#cc3681";
var color6 = "#9b1c56";
var color7 = "#a15cea";
var color8 = "#3d237a";
var color9 = "#3a3a3a";
var color10 = "#000000";




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
            HandlePathItem(doc, object, randomMultiplicationString(resultNumber), i);
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
    if (object.fillColor.red + object.fillColor.green + object.fillColor.blue < 120) {
        FormatTextFrame(textFrame, true);
    }
    else {
        FormatTextFrame(textFrame, false);
    }
    
}

function FormatTextFrame(textFrame, isFillDark) {
    textFrame.textRange.size = 7;
    textFrame.textRange.justification = Justification.CENTER;
    textFrame.textRange.verticalScale = 100;
    textFrame.textRange.leading = textFrame.textRange.size * 1.2;
    textFrame.textRange.baselineShift = -textFrame.textRange.size / 3;

    var blackColor = new RGBColor();
    blackColor.red = 0;
    blackColor.green = 0;
    blackColor.blue = 0;
    var whiteColor = new RGBColor();
    whiteColor.red = 254;
    whiteColor.green = 254;
    whiteColor.blue = 254;

    if (isFillDark) {
        textFrame.textRange.fillColor = whiteColor;
    }
    else {
        textFrame.textRange.fillColor = blackColor;
    }
    
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
        case color1.toUpperCase(): return 70;
        case color2.toUpperCase(): return 63
        case color3.toUpperCase(): return 56;
        case color4.toUpperCase(): return 49;
        case color5.toUpperCase(): return 42;
        case color6.toUpperCase(): return 35;
        case color7.toUpperCase(): return 28;
        case color8.toUpperCase(): return 21;
        case color9.toUpperCase(): return 14;
        case color10.toUpperCase(): return 7;
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

    if (!Number.isInteger(dividend) || dividend > 100) {
        return "Invalid input or result too large";
    }

    return dividend + " ÷ " + divisor;
}



main();
