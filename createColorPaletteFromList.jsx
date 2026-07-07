/*
createColorPaletteFromList.jsx

Creates a simple color palette on the active artboard in Adobe Illustrator.
Edit CONFIG.colors to use your own hex color list.
*/

var CONFIG = {
    colors: [
        "#ffffff",
        "#ff4de4",
        "#ef45ff",
        "#c83dff",
        "#9f38ff",
        "#6c4fd1",
        "#2f54a3",
        "#11868c",
        "#001314",
        "#d14b99",
    ],
    swatchCount: 10,
    maxColumns: 5,
    maxSwatchSize: 90,
    gap: 16,
    margin: 24,
    groupName: "Color Palette",
};

main();

function main() {
    if (app.documents.length === 0) {
        alert("Open an Illustrator document first.");
        return;
    }

    var doc = app.activeDocument;
    var colors = getPaletteColors(CONFIG.colors, CONFIG.swatchCount);
    if (colors.error) {
        alert(colors.error);
        return;
    }

    var artboardIndex = doc.artboards.getActiveArtboardIndex();
    var artboard = doc.artboards[artboardIndex];
    var layout = buildPaletteLayout(artboard.artboardRect, colors.length);
    if (layout.error) {
        alert(layout.error);
        return;
    }

    var paletteGroup = doc.activeLayer.groupItems.add();
    paletteGroup.name = CONFIG.groupName;

    for (var i = 0; i < colors.length; i++) {
        var position = getSwatchPosition(i, layout);
        var swatch = paletteGroup.pathItems.rectangle(
            position.top,
            position.left,
            layout.swatchSize,
            layout.swatchSize,
        );

        swatch.name =
            "Swatch_" + padNumber(i + 1) + "_" + colors[i].substring(1);
        swatch.stroked = false;
        swatch.filled = true;
        swatch.fillColor = hexToRGBColor(colors[i]);
    }

    doc.selection = null;
    paletteGroup.selected = true;

    alert(
        "Created " +
            colors.length +
            " color swatches on artboard " +
            (artboardIndex + 1) +
            ".",
    );
}

function getPaletteColors(colorList, swatchCount) {
    if (!colorList || colorList.length === 0) {
        return { error: "Add at least one hex color to CONFIG.colors." };
    }

    if (colorList.length < swatchCount) {
        return {
            error:
                "Add at least " +
                swatchCount +
                " hex colors to CONFIG.colors. Current count: " +
                colorList.length +
                ".",
        };
    }

    var paletteColors = [];
    var total = swatchCount;

    for (var i = 0; i < total; i++) {
        var normalizedHex = normalizeHexColor(colorList[i]);
        if (!normalizedHex) {
            return {
                error:
                    "Invalid hex color at position " +
                    (i + 1) +
                    ": " +
                    colorList[i],
            };
        }
        paletteColors.push(normalizedHex);
    }

    return paletteColors;
}

function buildPaletteLayout(artboardRect, colorCount) {
    var left = artboardRect[0];
    var top = artboardRect[1];
    var right = artboardRect[2];
    var bottom = artboardRect[3];

    var artboardWidth = right - left;
    var artboardHeight = top - bottom;
    var columns = Math.min(CONFIG.maxColumns, colorCount);
    var rows = Math.ceil(colorCount / columns);

    var usableWidth =
        artboardWidth - CONFIG.margin * 2 - CONFIG.gap * (columns - 1);
    var usableHeight =
        artboardHeight - CONFIG.margin * 2 - CONFIG.gap * (rows - 1);
    var swatchSize = Math.floor(
        Math.min(
            CONFIG.maxSwatchSize,
            usableWidth / columns,
            usableHeight / rows,
        ),
    );

    if (swatchSize <= 0) {
        return {
            error: "The active artboard is too small for this palette layout.",
        };
    }

    var totalWidth = columns * swatchSize + (columns - 1) * CONFIG.gap;
    var totalHeight = rows * swatchSize + (rows - 1) * CONFIG.gap;

    return {
        startLeft: left + (artboardWidth - totalWidth) / 2,
        startTop: top - (artboardHeight - totalHeight) / 2,
        columns: columns,
        swatchSize: swatchSize,
    };
}

function getSwatchPosition(index, layout) {
    var column = index % layout.columns;
    var row = Math.floor(index / layout.columns);

    return {
        left: layout.startLeft + column * (layout.swatchSize + CONFIG.gap),
        top: layout.startTop - row * (layout.swatchSize + CONFIG.gap),
    };
}

function hexToRGBColor(hex) {
    var color = new RGBColor();
    var cleanHex = hex.replace("#", "");

    color.red = parseInt(cleanHex.substring(0, 2), 16);
    color.green = parseInt(cleanHex.substring(2, 4), 16);
    color.blue = parseInt(cleanHex.substring(4, 6), 16);

    return color;
}

function normalizeHexColor(hex) {
    if (typeof hex !== "string") {
        return null;
    }

    var cleanHex = hex.replace(/\s+/g, "").replace("#", "").toUpperCase();
    if (/^[0-9A-F]{3}$/.test(cleanHex)) {
        cleanHex =
            cleanHex.charAt(0) +
            cleanHex.charAt(0) +
            cleanHex.charAt(1) +
            cleanHex.charAt(1) +
            cleanHex.charAt(2) +
            cleanHex.charAt(2);
    }

    if (!/^[0-9A-F]{6}$/.test(cleanHex)) {
        return null;
    }

    return "#" + cleanHex;
}

function padNumber(value) {
    return value < 10 ? "0" + value : String(value);
}
