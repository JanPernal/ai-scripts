var doc = app.activeDocument;

// 🔥 Ustawienia
var reverse = 0; // 👉 Jeśli true — kolory będą na odwrót

// 🎨 Definicja kolorów
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


// Lista kolorów
var colors = [color1, color2, color3, color4, color5, color6, color7, color8, color9, color10];

// 🔄 Odwrócenie kolejności jeśli reverse = true
if (reverse) {
    colors.reverse();
}

// 🎨 Funkcja konwertująca HEX na kolor RGB Illustrator
function hexToRGBColor(hex) {
    var color = new RGBColor();
    hex = hex.replace("#", "");
    color.red = parseInt(hex.substring(0, 2), 16);
    color.green = parseInt(hex.substring(2, 4), 16);
    color.blue = parseInt(hex.substring(4, 6), 16);
    return color;
}

// 🖌️ Wypełnianie obiektów
if (app.selection.length > 0) {
    for (var i = 0; i < app.selection.length; i++) {
        var item = app.selection[i];
        var colorIndex = i % colors.length;
        var fillColor = hexToRGBColor(colors[colorIndex]);

        if (item.typename === "PathItem") {
            item.filled = true;
            item.fillColor = fillColor;
        } else if (item.typename === "CompoundPathItem") {
            if (item.pathItems.length > 0) {
                item.pathItems[0].filled = true;
                item.pathItems[0].fillColor = fillColor;
            }
        }
    }
} else {
    alert("Zaznacz przynajmniej jeden obiekt.");
}
