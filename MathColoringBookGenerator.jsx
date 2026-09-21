/*
MathColoringBookGenerator.jsx

Universal color-by-math generator for Adobe Illustrator.

Usage:
1) Select colored objects (PathItem / groups containing PathItem).
2) Run this script.
3) Choose a mode (Fixed table, Random, Fractions), review the color
   mapping table on the right (auto-filled), edit any answer, then
   click Generate.

All configurable behaviour lives in the dialog. CONFIG below only
supplies the built-in defaults that populate the dialog the first
time it opens (or after "Reset defaults").
*/

var CONFIG = {
    // Mode: "fixed" | "random" | "fraction"
    mode: "fixed",

    // Fixed table settings.
    fixedOperation: "multiplication", // "multiplication" | "division"
    fixedFactor: 5,
    fixedMinFactor: 1,
    fixedMaxFactor: 10,
    fixedPreferFactorFirst: true,
    fixedDivisor: 10,
    fixedMaxDividend: null, // null = auto (divisor * color count)

    // Random settings.
    randomOperation: "multiplication", // "multiplication" | "division" | "mixed"
    randomMinFactor: 2,
    randomMaxFactor: 20,
    randomMinDivisor: 2,
    randomMaxDivisor: 10,
    randomMaxDividend: 144,
    randomizeOperandOrder: true,

    // Fraction settings.
    fractionOperation: "addition", // "addition" | "subtraction" | "multiplication" | "division"
    fractionAnswerType: "fraction", // "fraction" | "integer"
    fractionMaxDenominator: 12,
    fractionMaxWholeMultiplier: 12,
    fractionRequireSimplified: false,
    fractionSameDenominatorOnly: true,
    fractionAllowImproper: false,

    // If true, text can rotate to follow the best-fitting inner box.
    rotateTextWithShape: true,

    // Automatic text color (black/white) based on fill brightness.
    autoTextContrast: true,
    darkLumaThreshold: 130,

    // Text sizing.
    defaultTextSize: 10,
    minTextSize: 4,
    emergencyMinTextSize: 2,

    // Padding inside the detected inner box.
    textBoxPaddingRatio: 0.88,
    textHeightPaddingRatio: 0.82,

    // Sampling density for the inner-box search.
    innerBoxSamples: 28,

    // Optional deterministic randomness. Leave empty for normal random.
    randomSeed: "",

    legend: {
        enabled: true,
        layerName: "Math Legend",
        groupName: "MathLegend_Auto",
        replaceExisting: false,
        title: "Color key",
        margin: 20,
        swatchSize: 28,
        columnWidth: 38,
        rowHeight: 38,
        maxColumns: 5,
        labelSize: 10,
    },

    answerKey: {
        enabled: false,
        layerName: "Math Answer Key",
        hidden: true,
        textSize: 6,
        groupName: "MathAnswerKey_Auto",
    },

    // Layer that math text frames are created on. Auto-unlocked/shown before generation.
    mathTextLayerName: "Math Operations",

    // Layer that receives duplicates of shapes too small to hold text (left empty).
    preprintLayerName: "Preprint shapes",

    // Wraps each generated layer's contents in one named group.
    groupGeneratedItems: true,
    mathTextGroupName: "MathOperations_Auto",
    preprintGroupName: "PreprintShapes_Auto",
};

// Cache of measured text metrics, keyed by expression string (prefixed to
// avoid collisions with Object.prototype names).
var TEXT_METRICS_CACHE = {};
var TEXT_METRICS_REF_SIZE = 20;

main();

function main() {
    if (!hasOpenDocument()) {
        alert("No open document.");
        return;
    }

    var doc = app.activeDocument;
    if (!hasSelection(doc)) {
        alert("Please select objects first.");
        return;
    }

    var livePaintStats = preprocessLivePaint(doc);
    if (livePaintStats && livePaintStats.cancelled) {
        return;
    }

    if (!hasSelection(doc)) {
        alert("Please select objects first.");
        return;
    }

    var pathItems = [];
    collectPathItemsFromSelection(doc.selection, pathItems);
    if (pathItems.length === 0) {
        alert("No PathItem found in the selection.");
        return;
    }

    var scan = scanPalette(pathItems);
    if (scan.palette.length === 0) {
        alert("No objects with an RGB fill found in the selection.");
        return;
    }

    var sortedPalette = sortPaletteByRainbow(scan.palette);

    var persisted = loadPersistedSettings();
    var initialSettings = overlaySettings(buildDefaultSettings(), persisted);

    var dialogResult = showMainDialog(sortedPalette, initialSettings);
    if (!dialogResult) {
        return;
    }

    savePersistedSettings(dialogResult);
    applyDialogResultToConfig(dialogResult);

    var preset = buildPresetFromSettings(dialogResult, sortedPalette.length);

    var excludedColorsLookup = {};
    var dialogExcludedColors = dialogResult.excludedColors || [];
    for (var exIdx = 0; exIdx < dialogExcludedColors.length; exIdx++) {
        excludedColorsLookup["x_" + dialogExcludedColors[exIdx]] = true;
    }

    var colorToAnswer = {};
    for (var hex in dialogResult.colorAnswers) {
        if (dialogResult.colorAnswers.hasOwnProperty(hex)) {
            if (excludedColorsLookup.hasOwnProperty("x_" + hex)) {
                continue;
            }
            var parsed = parseAnswer(dialogResult.colorAnswers[hex]);
            if (parsed.ok) {
                colorToAnswer[hex] = parsed;
            }
        }
    }
    preset.colorToAnswer = colorToAnswer;
    preset.excludedColors = excludedColorsLookup;

    var hexCounts = {};
    for (var pi = 0; pi < sortedPalette.length; pi++) {
        hexCounts[sortedPalette[pi].hex] = sortedPalette[pi].count;
    }

    var probeRandomFn = createRandomFn(CONFIG.randomSeed);
    var unsatisfiable = findUnsatisfiableAnswers(preset.colorToAnswer, preset, probeRandomFn);
    if (unsatisfiable.length > 0) {
        var proceed = confirm(buildUnsatisfiableMessage(unsatisfiable, hexCounts));
        if (!proceed) {
            return;
        }
    }

    var textLayer = ensureWritableTextLayer(doc);
    if (!textLayer) {
        alert("Could not find or create a writable layer for the math text.\n\nUnlock a layer in the Layers panel and run the script again.");
        return;
    }
    var previousActiveLayer = doc.activeLayer;
    try {
        doc.activeLayer = textLayer;
    } catch (activeLayerError) {
        // Ignore - fall through and let processPathItems surface any error.
    }

    var previousUserInteractionLevel = app.userInteractionLevel;
    try {
        app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    } catch (setInteractionLevelError) {
        // Ignore.
    }

    var randomFn = createRandomFn(CONFIG.randomSeed);
    var result = processPathItems(doc, pathItems, preset, randomFn, textLayer);
    result.uniqueColors = sortedPalette.length;
    result.livePaint = livePaintStats;

    if (CONFIG.legend.enabled) {
        var legendEntries = buildLegendEntriesFromPalette(sortedPalette, preset.colorToAnswer);
        createLegend(doc, legendEntries);
    }

    try {
        app.userInteractionLevel = previousUserInteractionLevel;
    } catch (restoreInteractionLevelError) {
        // Ignore.
    }

    try {
        doc.activeLayer = previousActiveLayer;
    } catch (restoreLayerError) {
        // Ignore - restoring the previous active layer is best-effort.
    }

    showSummary(result, dialogResult);
}

function ensureWritableTextLayer(doc) {
    var existing = null;
    try {
        existing = doc.layers.getByName(CONFIG.mathTextLayerName);
    } catch (lookupError) {
        existing = null;
    }

    if (existing) {
        try {
            existing.locked = false;
        } catch (unlockError) {
            // Ignore.
        }
        try {
            existing.visible = true;
        } catch (unhideError) {
            // Ignore.
        }
        if (isLayerWritable(doc, existing)) {
            return existing;
        }
    }

    try {
        var created = doc.layers.add();
        created.name = CONFIG.mathTextLayerName;
        if (isLayerWritable(doc, created)) {
            return created;
        }
    } catch (createError) {
        // Fall through to the fallback search below.
    }

    var docLayers = doc.layers;
    var docLayersLength = docLayers.length;
    for (var i = 0; i < docLayersLength; i++) {
        var candidate = docLayers[i];
        try {
            candidate.locked = false;
        } catch (unlockCandidateError) {
            // Ignore.
        }
        try {
            candidate.visible = true;
        } catch (unhideCandidateError) {
            // Ignore.
        }

        var writable = isLayerWritable(doc, candidate);

        if (writable) {
            return candidate;
        }
    }

    return null;
}

function isLayerWritable(doc, layer) {
    var previousActiveLayer = null;
    try {
        previousActiveLayer = doc.activeLayer;
    } catch (getActiveLayerError) {
        // Ignore.
    }

    var writable = false;
    try {
        doc.activeLayer = layer;
        var probe = layer.pathItems.add();
        probe.remove();
        writable = true;
    } catch (probeError) {
        writable = false;
    }

    try {
        doc.activeLayer = previousActiveLayer;
    } catch (restoreActiveLayerError) {
        // Ignore.
    }

    return writable;
}

function ensureItemOnLayer(item, layer) {
    if (!item || !layer) {
        return item;
    }

    try {
        if (item.layer !== layer) {
            item.move(layer, ElementPlacement.PLACEATEND);
        }
    } catch (ensureItemOnLayerError) {
        // Ignore.
    }

    return item;
}

/* --- Live Paint pre-processing --- */

function isLivePaintGroup(item) {
    if (!item) {
        return false;
    }

    if (item.typename === "LivePaintGroup") {
        return true;
    }

    try {
        if (item.typename === "GroupItem" && item.isLivePaintGroup) {
            return true;
        }
    } catch (e) {
        return false;
    }

    return false;
}

function findLivePaintAncestor(item, list) {
    var current = item;
    while (current) {
        if (isLivePaintGroup(current)) {
            pushUnique(list, current);
            return true;
        }

        if (current.parent && current.parent.typename) {
            current = current.parent;
        } else {
            break;
        }
    }

    return false;
}

function collectLivePaintGroups(item, list) {
    if (findLivePaintAncestor(item, list)) {
        return;
    }

    if (item.typename === "GroupItem") {
        var pageItems = item.pageItems;
        var pageItemsLength = pageItems.length;
        for (var i = 0; i < pageItemsLength; i++) {
            collectLivePaintGroups(pageItems[i], list);
        }
    }
}

function computePaintVotes(group) {
    var paths = [];
    collectPathItems(group, paths);

    var votes = { fill: 0, stroke: 0 };
    for (var i = 0; i < paths.length; i++) {
        var p = paths[i];
        if (p.filled && !p.stroked) {
            votes.fill++;
        } else if (p.stroked && !p.filled) {
            votes.stroke++;
        }
    }
    return votes;
}

function sampleStrokeFromGroup(strokeGroup) {
    var paths = [];
    collectPathItems(strokeGroup, paths);

    var freq = {};
    var order = [];

    for (var i = 0; i < paths.length; i++) {
        var p = paths[i];
        if (!p.stroked || !p.strokeColor || p.strokeColor.typename !== "RGBColor") {
            continue;
        }

        var key = rgbColorToHex(p.strokeColor) + "@" + p.strokeWidth;
        if (freq[key] === undefined) {
            freq[key] = { count: 0, color: p.strokeColor, width: p.strokeWidth };
            order.push(key);
        }
        freq[key].count++;
    }

    if (order.length === 0) {
        return null;
    }

    var bestKey = order[0];
    var bestCount = freq[order[0]].count;
    for (var j = 1; j < order.length; j++) {
        if (freq[order[j]].count > bestCount) {
            bestCount = freq[order[j]].count;
            bestKey = order[j];
        }
    }

    return freq[bestKey];
}

function applyStrokeToFillGroup(fillGroup, sample) {
    if (!sample) {
        return;
    }

    var paths = [];
    collectPathItems(fillGroup, paths);

    for (var i = 0; i < paths.length; i++) {
        var p = paths[i];
        if (p.filled) {
            p.stroked = true;
            p.strokeColor = sample.color;
            p.strokeWidth = sample.width;
        }
    }
}

function splitLivePaintExpandedItem(item) {
    if (item.typename !== "GroupItem") {
        return { fillGroup: item, strokeRemoved: false };
    }

    var childGroups = [];
    var itemPageItems = item.pageItems;
    var itemPageItemsLength = itemPageItems.length;
    for (var i = 0; i < itemPageItemsLength; i++) {
        if (itemPageItems[i].typename === "GroupItem") {
            childGroups.push(itemPageItems[i]);
        }
    }

    if (childGroups.length < 2) {
        return { fillGroup: item, strokeRemoved: false };
    }

    var votesList = [];
    for (var g = 0; g < childGroups.length; g++) {
        votesList.push(computePaintVotes(childGroups[g]));
    }

    var bestFillIdx = 0;
    for (var f = 1; f < votesList.length; f++) {
        if (votesList[f].fill > votesList[bestFillIdx].fill) {
            bestFillIdx = f;
        }
    }

    var bestStrokeIdx = -1;
    for (var s = 0; s < votesList.length; s++) {
        if (s === bestFillIdx) {
            continue;
        }
        if (
            votesList[s].stroke > 0 &&
            (bestStrokeIdx === -1 || votesList[s].stroke > votesList[bestStrokeIdx].stroke)
        ) {
            bestStrokeIdx = s;
        }
    }

    if (bestStrokeIdx === -1) {
        return { fillGroup: item, strokeRemoved: false };
    }

    var fillGroup = childGroups[bestFillIdx];
    var strokeGroup = childGroups[bestStrokeIdx];

    var sample = sampleStrokeFromGroup(strokeGroup);
    applyStrokeToFillGroup(fillGroup, sample);

    try {
        strokeGroup.remove();
    } catch (e) {
        return { fillGroup: fillGroup, strokeRemoved: false };
    }

    return { fillGroup: fillGroup, strokeRemoved: true };
}

function preprocessLivePaint(doc) {
    var groups = [];
    var docSelection = doc.selection;
    var docSelectionLength = docSelection.length;
    for (var i = 0; i < docSelectionLength; i++) {
        collectLivePaintGroups(docSelection[i], groups);
    }

    if (groups.length === 0) {
        return null;
    }

    var proceed = confirm(
        "The selection contains " +
            groups.length +
            " Live Paint group(s).\n\n" +
            "Live Paint artwork must be expanded before math can be placed.\n" +
            "This will:\n" +
            "  - permanently expand the Live Paint group (editability is lost)\n" +
            "  - keep the fill shapes and apply the outline stroke to them\n" +
            "  - delete the separate stroke group\n\n" +
            "Any outlines around UNFILLED regions will be removed.\n\n" +
            "Expand now?",
    );

    if (!proceed) {
        return { expanded: 0, strokeGroupRemoved: false, cancelled: true };
    }

    try {
        doc.selection = groups;
        app.executeMenuCommand("Live Paint Expand");
    } catch (e) {
        alert("Could not expand the Live Paint group: " + e);
        return { expanded: 0, strokeGroupRemoved: false, cancelled: true };
    }

    var expandedItems = [];
    var expandedSelection = doc.selection;
    var expandedSelectionLength = expandedSelection.length;
    for (var j = 0; j < expandedSelectionLength; j++) {
        expandedItems.push(expandedSelection[j]);
    }

    var fillGroups = [];
    var strokeGroupRemoved = false;

    for (var k = 0; k < expandedItems.length; k++) {
        var outcome = splitLivePaintExpandedItem(expandedItems[k]);
        pushUnique(fillGroups, outcome.fillGroup);
        if (outcome.strokeRemoved) {
            strokeGroupRemoved = true;
        }
    }

    doc.selection = fillGroups;

    return {
        expanded: groups.length,
        strokeGroupRemoved: strokeGroupRemoved,
        cancelled: false,
    };
}

/* ------------------------------------------------------------------ *
 * Feasibility pre-flight check
 * ------------------------------------------------------------------ */

function findUnsatisfiableAnswers(colorAnswers, preset, randomFn) {
    var results = [];
    var keyToIndex = {};

    for (var hex in colorAnswers) {
        if (!colorAnswers.hasOwnProperty(hex)) {
            continue;
        }

        var answerObj = colorAnswers[hex];
        var key = answerObj.kind + ":" + answerObj.num + "/" + answerObj.den;

        if (!keyToIndex.hasOwnProperty(key)) {
            var expression = buildExpression(answerObj, preset, randomFn);
            if (!expression) {
                results.push({ display: answerObj.display, hexes: [hex] });
                keyToIndex[key] = results.length - 1;
            } else {
                keyToIndex[key] = -1;
            }
        } else {
            var idx = keyToIndex[key];
            if (idx !== -1) {
                results[idx].hexes.push(hex);
            }
        }
    }

    return results;
}

function buildUnsatisfiableMessage(unsatisfiable, hexCounts) {
    var maxLines = 12;
    var lines = [];

    for (var i = 0; i < unsatisfiable.length && i < maxLines; i++) {
        var entry = unsatisfiable[i];
        var total = 0;
        for (var h = 0; h < entry.hexes.length; h++) {
            var c = hexCounts[entry.hexes[h]];
            if (c) {
                total += c;
            }
        }
        var shapeWord = total === 1 ? "shape" : "shapes";
        lines.push(
            "  " +
                entry.display +
                "   (used by " +
                total +
                " " +
                shapeWord +
                ", " +
                entry.hexes.join(", ") +
                ")",
        );
    }

    if (unsatisfiable.length > maxLines) {
        lines.push("... and " + (unsatisfiable.length - maxLines) + " more.");
    }

    return (
        "These answers cannot be expressed with the current settings:\n\n" +
        lines.join("\n") +
        "\n\nThose shapes will be left without math text.\n\n" +
        'Try raising "Max denominator", turning on "Allow improper fractions",\n' +
        "or choosing different answers.\n\n" +
        "Continue anyway?"
    );
}

/* ------------------------------------------------------------------ *
 * Palette scanning
 * ------------------------------------------------------------------ */

function scanPalette(pathItems) {
    var counts = {};
    var order = [];
    var skippedHiddenOrLocked = 0;
    var skippedNonRGB = 0;

    for (var i = 0; i < pathItems.length; i++) {
        var pathItem = pathItems[i];

        if (pathItem.hidden || pathItem.locked) {
            skippedHiddenOrLocked++;
            continue;
        }

        if (!isRGBFill(pathItem)) {
            skippedNonRGB++;
            continue;
        }

        var hex = rgbColorToHex(pathItem.fillColor).toUpperCase();
        if (counts[hex] === undefined) {
            counts[hex] = 0;
            order.push(hex);
        }
        counts[hex]++;
    }

    var palette = [];
    for (var j = 0; j < order.length; j++) {
        palette.push({ hex: order[j], count: counts[order[j]] });
    }

    return {
        palette: palette,
        skippedHiddenOrLocked: skippedHiddenOrLocked,
        skippedNonRGB: skippedNonRGB,
    };
}

function sortPaletteByRainbow(palette) {
    var hexes = [];
    for (var i = 0; i < palette.length; i++) {
        hexes.push(palette[i].hex);
    }

    var sortedHexes = sortColorsByAestheticRainbow(hexes);
    var countByHex = {};
    for (var j = 0; j < palette.length; j++) {
        countByHex[palette[j].hex] = palette[j].count;
    }

    var result = [];
    for (var k = 0; k < sortedHexes.length; k++) {
        result.push({ hex: sortedHexes[k], count: countByHex[sortedHexes[k]] });
    }

    return result;
}

/* ------------------------------------------------------------------ *
 * Settings model / persistence
 * ------------------------------------------------------------------ */

function buildDefaultSettings() {
    return {
        mode: CONFIG.mode,

        fixedOperation: CONFIG.fixedOperation,
        fixedFactor: CONFIG.fixedFactor,
        fixedMinFactor: CONFIG.fixedMinFactor,
        fixedMaxFactor: CONFIG.fixedMaxFactor,
        fixedPreferFactorFirst: CONFIG.fixedPreferFactorFirst,
        fixedDivisor: CONFIG.fixedDivisor,
        fixedMaxDividend: CONFIG.fixedMaxDividend,

        randomOperation: CONFIG.randomOperation,
        randomMinFactor: CONFIG.randomMinFactor,
        randomMaxFactor: CONFIG.randomMaxFactor,
        randomMinDivisor: CONFIG.randomMinDivisor,
        randomMaxDivisor: CONFIG.randomMaxDivisor,
        randomMaxDividend: CONFIG.randomMaxDividend,
        randomizeOperandOrder: CONFIG.randomizeOperandOrder,

        fractionOperation: CONFIG.fractionOperation,
        fractionAnswerType: CONFIG.fractionAnswerType,
        fractionMaxDenominator: CONFIG.fractionMaxDenominator,
        fractionMaxWholeMultiplier: CONFIG.fractionMaxWholeMultiplier,
        fractionRequireSimplified: CONFIG.fractionRequireSimplified,
        fractionSameDenominatorOnly: CONFIG.fractionSameDenominatorOnly,
        fractionAllowImproper: CONFIG.fractionAllowImproper,

        defaultTextSize: CONFIG.defaultTextSize,
        minTextSize: CONFIG.minTextSize,
        rotateTextWithShape: CONFIG.rotateTextWithShape,
        autoTextContrast: CONFIG.autoTextContrast,
        legendEnabled: CONFIG.legend.enabled,
        legendMaxColumns: CONFIG.legend.maxColumns,
        answerKeyEnabled: CONFIG.answerKey.enabled,
        randomSeed: CONFIG.randomSeed,
        mathTextLayerName: CONFIG.mathTextLayerName,
        preprintLayerName: CONFIG.preprintLayerName,

        colorAnswers: {},
        excludedColors: [],
    };
}

function overlaySettings(base, overlay) {
    var result = shallowCopy(base);
    if (!overlay) {
        return result;
    }

    for (var key in overlay) {
        if (
            overlay.hasOwnProperty(key) &&
            key !== "colorAnswers" &&
            key !== "excludedColors" &&
            overlay[key] !== null &&
            overlay[key] !== undefined
        ) {
            result[key] = overlay[key];
        }
    }

    result.colorAnswers = {};
    if (overlay.colorAnswers) {
        for (var hex in overlay.colorAnswers) {
            if (overlay.colorAnswers.hasOwnProperty(hex)) {
                result.colorAnswers[hex] = overlay.colorAnswers[hex];
            }
        }
    }

    result.excludedColors = [];
    if (overlay.excludedColors) {
        for (var exIdx = 0; exIdx < overlay.excludedColors.length; exIdx++) {
            result.excludedColors.push(overlay.excludedColors[exIdx]);
        }
    }

    return result;
}

function applyDialogResultToConfig(s) {
    CONFIG.mode = s.mode;

    CONFIG.fixedOperation = s.fixedOperation;
    CONFIG.fixedFactor = s.fixedFactor;
    CONFIG.fixedMinFactor = s.fixedMinFactor;
    CONFIG.fixedMaxFactor = s.fixedMaxFactor;
    CONFIG.fixedPreferFactorFirst = s.fixedPreferFactorFirst;
    CONFIG.fixedDivisor = s.fixedDivisor;
    CONFIG.fixedMaxDividend = s.fixedMaxDividend;

    CONFIG.randomOperation = s.randomOperation;
    CONFIG.randomMinFactor = s.randomMinFactor;
    CONFIG.randomMaxFactor = s.randomMaxFactor;
    CONFIG.randomMinDivisor = s.randomMinDivisor;
    CONFIG.randomMaxDivisor = s.randomMaxDivisor;
    CONFIG.randomMaxDividend = s.randomMaxDividend;
    CONFIG.randomizeOperandOrder = s.randomizeOperandOrder;

    CONFIG.fractionOperation = s.fractionOperation;
    CONFIG.fractionAnswerType = s.fractionAnswerType;
    CONFIG.fractionMaxDenominator = s.fractionMaxDenominator;
    CONFIG.fractionMaxWholeMultiplier = s.fractionMaxWholeMultiplier;
    CONFIG.fractionRequireSimplified = s.fractionRequireSimplified;
    CONFIG.fractionSameDenominatorOnly = s.fractionSameDenominatorOnly;
    CONFIG.fractionAllowImproper = s.fractionAllowImproper;

    CONFIG.defaultTextSize = s.defaultTextSize;
    CONFIG.minTextSize = s.minTextSize;
    CONFIG.rotateTextWithShape = s.rotateTextWithShape;
    CONFIG.autoTextContrast = s.autoTextContrast;
    CONFIG.legend.enabled = s.legendEnabled;
    CONFIG.legend.maxColumns = s.legendMaxColumns;
    CONFIG.answerKey.enabled = s.answerKeyEnabled;
    CONFIG.randomSeed = s.randomSeed;
    var layerName = trimString(String(s.mathTextLayerName || ""));
    CONFIG.mathTextLayerName = layerName === "" ? "Math Operations" : layerName;
    var preprintLayerName = trimString(String(s.preprintLayerName || ""));
    CONFIG.preprintLayerName = preprintLayerName === "" ? "Preprint shapes" : preprintLayerName;
}

function buildPresetFromSettings(s, colorCount) {
    var preset = { textSize: s.defaultTextSize };

    if (s.mode === "fixed") {
        if (s.fixedOperation === "multiplication") {
            preset.mode = "multiplication";
            preset.multiplication = {
                minFactor: s.fixedMinFactor,
                maxFactor: s.fixedMaxFactor,
                fixedFactor: s.fixedFactor,
                randomizeOrder: false,
                preferFixedFactorFirst: s.fixedPreferFactorFirst,
            };
        } else {
            preset.mode = "division";
            var maxDividend = s.fixedMaxDividend;
            if (maxDividend === null || maxDividend === undefined) {
                maxDividend = s.fixedDivisor * colorCount;
            }
            preset.division = {
                minDivisor: s.fixedDivisor,
                maxDivisor: s.fixedDivisor,
                fixedDivisor: s.fixedDivisor,
                maxDividend: maxDividend,
            };
        }
        return preset;
    }

    if (s.mode === "random") {
        var mulConfig = {
            minFactor: s.randomMinFactor,
            maxFactor: s.randomMaxFactor,
            fixedFactor: null,
            randomizeOrder: s.randomizeOperandOrder,
            preferFixedFactorFirst: false,
        };
        var divConfig = {
            minDivisor: s.randomMinDivisor,
            maxDivisor: s.randomMaxDivisor,
            fixedDivisor: null,
            maxDividend: s.randomMaxDividend,
        };

        if (s.randomOperation === "multiplication") {
            preset.mode = "multiplication";
            preset.multiplication = mulConfig;
        } else if (s.randomOperation === "division") {
            preset.mode = "division";
            preset.division = divConfig;
        } else {
            preset.mode = "mixed";
            preset.multiplication = mulConfig;
            preset.division = divConfig;
        }
        return preset;
    }

    if (s.mode === "fraction") {
        preset.mode = "fraction";
        preset.fraction = {
            operation: s.fractionOperation,
            answerType: s.fractionAnswerType,
            maxDenominator: s.fractionMaxDenominator,
            maxWholeMultiplier: s.fractionMaxWholeMultiplier,
            requireSimplified: s.fractionRequireSimplified,
            sameDenominatorOnly: s.fractionSameDenominatorOnly,
            allowImproper: s.fractionAllowImproper,
        };
        return preset;
    }

    preset.mode = "multiplication";
    preset.multiplication = {
        minFactor: 1,
        maxFactor: 10,
        fixedFactor: null,
        randomizeOrder: false,
        preferFixedFactorFirst: false,
    };
    return preset;
}

function getSettingsFile() {
    try {
        var folder = File($.fileName).parent;
        return new File(folder + "/MathColoringBookGenerator.settings.json");
    } catch (e) {
        return null;
    }
}

function loadPersistedSettings() {
    try {
        var f = getSettingsFile();
        if (!f || !f.exists) {
            return null;
        }
        f.encoding = "UTF-8";
        f.open("r");
        var content = f.read();
        f.close();
        return parseSettings(content);
    } catch (e) {
        return null;
    }
}

function savePersistedSettings(settings) {
    try {
        var f = getSettingsFile();
        if (!f) {
            return;
        }
        f.encoding = "UTF-8";
        f.open("w");
        f.write(serializeSettings(settings));
        f.close();
    } catch (e) {
        // Ignore - e.g. read-only folder.
    }
}

/* ------------------------------------------------------------------ *
 * Hand-written JSON serialization / parsing
 * ------------------------------------------------------------------ */

function serializeSettings(obj) {
    return jsonStringifyValue(obj);
}

function jsonStringifyValue(value) {
    if (value === null || value === undefined) {
        return "null";
    }
    if (typeof value === "boolean") {
        return value ? "true" : "false";
    }
    if (typeof value === "number") {
        return String(value);
    }
    if (typeof value === "string") {
        return jsonStringifyString(value);
    }
    if (typeof value === "object") {
        var parts = [];
        for (var key in value) {
            if (value.hasOwnProperty(key)) {
                parts.push(
                    jsonStringifyString(key) + ":" + jsonStringifyValue(value[key]),
                );
            }
        }
        return "{" + parts.join(",") + "}";
    }
    return "null";
}

function jsonStringifyString(str) {
    var s = String(str);
    var out = "\"";
    for (var i = 0; i < s.length; i++) {
        var c = s.charAt(i);
        if (c === "\"" || c === "\\") {
            out += "\\" + c;
        } else if (c === "\n") {
            out += "\\n";
        } else if (c === "\r") {
            out += "\\r";
        } else if (c === "\t") {
            out += "\\t";
        } else {
            out += c;
        }
    }
    out += "\"";
    return out;
}

function parseSettings(str) {
    try {
        if (!str) {
            return null;
        }
        var pos = { i: 0 };
        jsonSkipWhitespace(str, pos);
        return jsonParseValue(str, pos);
    } catch (e) {
        return null;
    }
}

function jsonSkipWhitespace(str, pos) {
    while (pos.i < str.length && /\s/.test(str.charAt(pos.i))) {
        pos.i++;
    }
}

function jsonParseValue(str, pos) {
    jsonSkipWhitespace(str, pos);
    var c = str.charAt(pos.i);
    if (c === "{") {
        return jsonParseObject(str, pos);
    }
    if (c === "\"") {
        return jsonParseString(str, pos);
    }
    if (c === "t" || c === "f") {
        return jsonParseBool(str, pos);
    }
    if (c === "n") {
        pos.i += 4;
        return null;
    }
    return jsonParseNumber(str, pos);
}

function jsonParseObject(str, pos) {
    var obj = {};
    pos.i++; // consume "{"
    jsonSkipWhitespace(str, pos);
    if (str.charAt(pos.i) === "}") {
        pos.i++;
        return obj;
    }

    while (true) {
        jsonSkipWhitespace(str, pos);
        var key = jsonParseString(str, pos);
        jsonSkipWhitespace(str, pos);
        pos.i++; // consume ":"
        var value = jsonParseValue(str, pos);
        obj[key] = value;
        jsonSkipWhitespace(str, pos);
        var ch = str.charAt(pos.i);
        if (ch === ",") {
            pos.i++;
            continue;
        }
        if (ch === "}") {
            pos.i++;
            break;
        }
        break;
    }

    return obj;
}

function jsonParseString(str, pos) {
    pos.i++; // consume opening quote
    var out = "";
    while (pos.i < str.length) {
        var c = str.charAt(pos.i);
        if (c === "\"") {
            pos.i++;
            break;
        }
        if (c === "\\") {
            pos.i++;
            var esc = str.charAt(pos.i);
            if (esc === "n") {
                out += "\n";
            } else if (esc === "t") {
                out += "\t";
            } else if (esc === "r") {
                out += "\r";
            } else {
                out += esc;
            }
            pos.i++;
        } else {
            out += c;
            pos.i++;
        }
    }
    return out;
}

function jsonParseBool(str, pos) {
    if (str.substr(pos.i, 4) === "true") {
        pos.i += 4;
        return true;
    }
    pos.i += 5;
    return false;
}

function jsonParseNumber(str, pos) {
    var start = pos.i;
    while (pos.i < str.length && /[0-9\.\-eE\+]/.test(str.charAt(pos.i))) {
        pos.i++;
    }
    return parseFloat(str.substring(start, pos.i));
}

/* ------------------------------------------------------------------ *
 * Rational number helpers
 * ------------------------------------------------------------------ */

function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
        var t = b;
        b = a % b;
        a = t;
    }
    return a === 0 ? 1 : a;
}

function makeRational(n, d) {
    if (d === 0) {
        d = 1;
    }
    if (d < 0) {
        n = -n;
        d = -d;
    }
    var g = gcd(n, d);
    if (g === 0) {
        g = 1;
    }
    return { num: n / g, den: d / g };
}

function rawRational(n, d) {
    return { num: n, den: d };
}

function ratAdd(a, b) {
    return makeRational(a.num * b.den + b.num * a.den, a.den * b.den);
}

function ratSub(a, b) {
    return makeRational(a.num * b.den - b.num * a.den, a.den * b.den);
}

function ratMul(a, b) {
    return makeRational(a.num * b.num, a.den * b.den);
}

function ratDiv(a, b) {
    return makeRational(a.num * b.den, a.den * b.num);
}

function ratEquals(a, b) {
    return a.num * b.den === b.num * a.den;
}

function ratToString(r) {
    if (r.den === 1) {
        return String(r.num);
    }
    return r.num + "/" + r.den;
}

function ratValue(r) {
    return r.num / r.den;
}

/* ------------------------------------------------------------------ *
 * Answer parsing
 * ------------------------------------------------------------------ */

function trimString(s) {
    return String(s).replace(/^\s+|\s+$/g, "");
}

function parseAnswer(text) {
    if (text === null || text === undefined) {
        return { ok: false, error: "Empty answer." };
    }

    var trimmed = trimString(String(text));
    if (trimmed === "") {
        return { ok: false, error: "Empty answer." };
    }

    var mixedMatch = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixedMatch) {
        var whole = parseInt(mixedMatch[1], 10);
        var mNum = parseInt(mixedMatch[2], 10);
        var mDen = parseInt(mixedMatch[3], 10);
        if (mDen <= 0) {
            return { ok: false, error: "Denominator must be positive." };
        }
        return {
            ok: true,
            kind: "frac",
            num: whole * mDen + mNum,
            den: mDen,
            display: trimmed,
        };
    }

    var fracMatch = trimmed.match(/^(-?\d+)\/(\d+)$/);
    if (fracMatch) {
        var fNum = parseInt(fracMatch[1], 10);
        var fDen = parseInt(fracMatch[2], 10);
        if (fDen <= 0) {
            return { ok: false, error: "Denominator must be positive." };
        }
        if (fNum <= 0) {
            return { ok: false, error: "Numerator must be positive." };
        }
        return {
            ok: true,
            kind: "frac",
            num: fNum,
            den: fDen,
            display: trimmed,
        };
    }

    if (/^-?\d+$/.test(trimmed)) {
        var ival = parseInt(trimmed, 10);
        if (ival <= 0) {
            return { ok: false, error: "Value must be a positive number." };
        }
        return {
            ok: true,
            kind: "int",
            num: ival,
            den: 1,
            display: trimmed,
        };
    }

    return { ok: false, error: 'Could not parse "' + trimmed + '".' };
}

/* ------------------------------------------------------------------ *
 * Auto-fill answer generation
 * ------------------------------------------------------------------ */

function buildAutoAnswers(mode, settings, colorCount) {
    if (colorCount <= 0) {
        return [];
    }

    if (mode === "fixed") {
        var nums;
        if (settings.fixedOperation === "multiplication") {
            nums = [];
            for (var i = 1; i <= colorCount; i++) {
                nums.push(settings.fixedFactor * i);
            }
        } else {
            nums = [];
            for (var j = 1; j <= colorCount; j++) {
                nums.push(j);
            }
        }
        return numbersToStrings(sortNumbersDescending(nums));
    }

    if (mode === "random") {
        var pool;
        if (settings.randomOperation === "division") {
            pool = buildDistinctQuotientPool(settings);
        } else {
            pool = buildDistinctProductPool(settings);
        }
        return numbersToStrings(pickEvenlySpacedDescending(pool, colorCount));
    }

    if (mode === "fraction") {
        if (settings.fractionAnswerType === "integer") {
            var ints = [];
            for (var k = 1; k <= colorCount; k++) {
                ints.push(k);
            }
            return numbersToStrings(sortNumbersDescending(ints));
        }
        return buildFractionAnswerStrings(settings, colorCount);
    }

    return [];
}

function numbersToStrings(nums) {
    var out = [];
    for (var i = 0; i < nums.length; i++) {
        out.push(String(nums[i]));
    }
    return out;
}

function buildDistinctProductPool(settings) {
    var minF = settings.randomMinFactor;
    var maxF = settings.randomMaxFactor;
    var seen = {};
    var values = [];

    for (var a = minF; a <= maxF; a++) {
        for (var b = a; b <= maxF; b++) {
            var p = a * b;
            if (!seen[p]) {
                seen[p] = true;
                values.push(p);
            }
        }
    }

    values.sort(function (x, y) {
        return y - x;
    });
    return values;
}

function buildDistinctQuotientPool(settings) {
    var minD = settings.randomMinDivisor;
    var maxD = settings.randomMaxDivisor;
    var maxDividend = settings.randomMaxDividend;
    var seen = {};
    var values = [];

    for (var d = minD; d <= maxD; d++) {
        if (d === 0) {
            continue;
        }
        for (var q = 1; q * d <= maxDividend; q++) {
            if (!seen[q]) {
                seen[q] = true;
                values.push(q);
            }
        }
    }

    values.sort(function (x, y) {
        return y - x;
    });
    return values;
}

function pickEvenlySpacedDescending(pool, count) {
    if (pool.length === 0) {
        return [];
    }

    if (pool.length <= count) {
        var result = pool.slice(0);
        var next = 1;
        while (result.length < count) {
            result.push(next);
            next++;
        }
        result.sort(function (a, b) {
            return b - a;
        });
        return result.slice(0, count);
    }

    var picked = [];
    var seenIdx = {};
    var denom = count - 1 <= 0 ? 1 : count - 1;

    for (var i = 0; i < count; i++) {
        var idx = Math.floor((i * (pool.length - 1)) / denom);
        var offset = 1;
        while (seenIdx[idx] && offset < pool.length) {
            idx = idx + offset;
            if (idx >= pool.length) {
                idx = pool.length - 1;
            }
            offset++;
        }
        seenIdx[idx] = true;
        picked.push(pool[idx]);
    }

    picked.sort(function (a, b) {
        return b - a;
    });
    return picked;
}

function buildFractionAnswerStrings(settings, colorCount) {
    var maxDen = settings.fractionMaxDenominator;
    var allowImproper = settings.fractionAllowImproper;
    var pool = [];
    var attempts = 0;

    while (pool.length < colorCount && attempts < 20) {
        pool = enumerateFractionPool(maxDen, allowImproper);
        if (pool.length < colorCount) {
            maxDen++;
        }
        attempts++;
    }

    var picked = pickEvenlySpacedFractionsDescending(pool, colorCount);
    var out = [];
    for (var i = 0; i < picked.length; i++) {
        out.push(ratToString(picked[i]));
    }
    return out;
}

function enumerateFractionPool(maxDen, allowImproper) {
    var seenKey = {};
    var list = [];
    var maxNumMultiplier = allowImproper ? 3 : 1;

    for (var d = 2; d <= maxDen; d++) {
        var maxN = allowImproper ? d * maxNumMultiplier : d - 1;
        for (var n = 1; n <= maxN; n++) {
            if (!allowImproper && n >= d) {
                continue;
            }
            if (allowImproper && n / d > 3) {
                continue;
            }
            var r = makeRational(n, d);
            var key = r.num + "/" + r.den;
            if (seenKey[key]) {
                continue;
            }
            seenKey[key] = true;
            list.push(r);
        }
    }

    list.sort(function (a, b) {
        return ratValue(b) - ratValue(a);
    });
    return list;
}

function pickEvenlySpacedFractionsDescending(pool, count) {
    if (pool.length === 0) {
        return [];
    }
    if (pool.length <= count) {
        return pool.slice(0, pool.length);
    }

    var picked = [];
    var seenIdx = {};
    var denom = count - 1 <= 0 ? 1 : count - 1;

    for (var i = 0; i < count; i++) {
        var idx = Math.floor((i * (pool.length - 1)) / denom);
        var offset = 1;
        while (seenIdx[idx] && offset < pool.length) {
            idx = idx + offset;
            if (idx >= pool.length) {
                idx = pool.length - 1;
            }
            offset++;
        }
        seenIdx[idx] = true;
        picked.push(pool[idx]);
    }

    picked.sort(function (a, b) {
        return ratValue(b) - ratValue(a);
    });
    return picked;
}

/* ------------------------------------------------------------------ *
 * Recommended answers ("as many divisors as possible")
 * ------------------------------------------------------------------ */

function buildRecommendedAnswers(mode, settings, colorCount, randomFn) {
    if (colorCount <= 0) {
        return [];
    }

    if (mode === "fixed") {
        return buildAutoAnswers(mode, settings, colorCount);
    }

    var candidates = buildRecommendationCandidatePool(mode, settings);
    if (!candidates || candidates.length === 0) {
        return buildAutoAnswers(mode, settings, colorCount);
    }

    candidates = clampRecommendationCandidates(
        candidates,
        settings.recommendRangeMin,
        settings.recommendRangeMax,
    );

    candidates.sort(function (a, b) {
        if (b.score !== a.score) {
            return b.score - a.score;
        }
        return b.numericValue - a.numericValue;
    });

    var minPool = Math.max(colorCount * 2, colorCount);
    var poolCount = Math.ceil(candidates.length * 0.3);
    if (poolCount < minPool) {
        poolCount = minPool;
    }
    if (poolCount > candidates.length) {
        poolCount = candidates.length;
    }
    var pool = candidates.slice(0, poolCount);

    var shuffled = shuffleWithRandomFn(pool, randomFn);
    var sampleCount = Math.min(colorCount, shuffled.length);
    var selected = shuffled.slice(0, sampleCount);

    selected.sort(function (a, b) {
        return b.numericValue - a.numericValue;
    });

    var displays = [];
    for (var i = 0; i < selected.length; i++) {
        displays.push(selected[i].display);
    }

    if (displays.length < colorCount) {
        var fallback = buildAutoAnswers(mode, settings, colorCount);
        var fi = 0;
        while (displays.length < colorCount && fi < fallback.length) {
            displays.push(fallback[fi]);
            fi++;
        }
    }

    return displays;
}

function buildRecommendationCandidatePool(mode, settings) {
    if (mode === "random") {
        if (settings.randomOperation === "multiplication") {
            return buildMultiplicationScoreCandidates(settings.randomMinFactor, settings.randomMaxFactor);
        }
        if (settings.randomOperation === "division") {
            return buildDivisionScoreCandidates(
                settings.randomMinDivisor,
                settings.randomMaxDivisor,
                settings.randomMaxDividend,
            );
        }
        var mulCandidates = buildMultiplicationScoreCandidates(settings.randomMinFactor, settings.randomMaxFactor);
        var divCandidates = buildDivisionScoreCandidates(
            settings.randomMinDivisor,
            settings.randomMaxDivisor,
            settings.randomMaxDividend,
        );
        return mergeScoreCandidates(mulCandidates, divCandidates);
    }

    if (mode === "fraction" && settings.fractionAnswerType !== "integer") {
        return buildFractionScoreCandidates(settings.fractionMaxDenominator, settings.fractionAllowImproper);
    }

    return null;
}

function buildMultiplicationScoreCandidates(minFactor, maxFactor) {
    var scores = {};
    var order = [];

    for (var a = minFactor; a <= maxFactor; a++) {
        for (var b = minFactor; b <= maxFactor; b++) {
            var p = a * b;
            if (scores[p] === undefined) {
                scores[p] = 0;
                order.push(p);
            }
            scores[p] = scores[p] + 1;
        }
    }

    var list = [];
    for (var i = 0; i < order.length; i++) {
        var v = order[i];
        list.push({ numericValue: v, score: scores[v], display: String(v) });
    }
    return list;
}

function buildDivisionScoreCandidates(minDivisor, maxDivisor, maxDividend) {
    var scores = {};
    var order = [];

    for (var d = minDivisor; d <= maxDivisor; d++) {
        if (d === 0) {
            continue;
        }
        for (var q = 1; q * d <= maxDividend; q++) {
            if (scores[q] === undefined) {
                scores[q] = 0;
                order.push(q);
            }
            scores[q] = scores[q] + 1;
        }
    }

    var list = [];
    for (var i = 0; i < order.length; i++) {
        var v = order[i];
        list.push({ numericValue: v, score: scores[v], display: String(v) });
    }
    return list;
}

function mergeScoreCandidates(listA, listB) {
    var scores = {};
    var order = [];
    var i;

    for (i = 0; i < listA.length; i++) {
        var a = listA[i];
        if (scores[a.numericValue] === undefined) {
            scores[a.numericValue] = 0;
            order.push(a.numericValue);
        }
        scores[a.numericValue] = scores[a.numericValue] + a.score;
    }

    for (i = 0; i < listB.length; i++) {
        var b = listB[i];
        if (scores[b.numericValue] === undefined) {
            scores[b.numericValue] = 0;
            order.push(b.numericValue);
        }
        scores[b.numericValue] = scores[b.numericValue] + b.score;
    }

    var list = [];
    for (i = 0; i < order.length; i++) {
        var v = order[i];
        list.push({ numericValue: v, score: scores[v], display: String(v) });
    }
    return list;
}

function buildFractionScoreCandidates(maxDen, allowImproper) {
    var pool = enumerateFractionPool(maxDen, allowImproper);
    var list = [];

    for (var i = 0; i < pool.length; i++) {
        var r = pool[i];
        var value = ratValue(r);
        var score = 0;
        for (var d = 1; d <= maxDen; d++) {
            var product = value * d;
            if (Math.abs(product - Math.round(product)) < 1e-9) {
                score++;
            }
        }
        list.push({ numericValue: value, score: score, display: ratToString(r) });
    }
    return list;
}

function clampRecommendationCandidates(candidates, rangeMin, rangeMax) {
    var hasMin = rangeMin !== null && rangeMin !== undefined && !isNaN(rangeMin);
    var hasMax = rangeMax !== null && rangeMax !== undefined && !isNaN(rangeMax);

    if (!hasMin && !hasMax) {
        return candidates.slice(0);
    }

    var out = [];
    for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        if (hasMin && c.numericValue < rangeMin) {
            continue;
        }
        if (hasMax && c.numericValue > rangeMax) {
            continue;
        }
        out.push(c);
    }
    return out;
}

function computeDerivedRecommendRange(mode, settings) {
    var candidates = buildRecommendationCandidatePool(mode, settings);
    if (!candidates || candidates.length === 0) {
        return null;
    }

    var min = candidates[0].numericValue;
    var max = candidates[0].numericValue;
    for (var i = 1; i < candidates.length; i++) {
        if (candidates[i].numericValue < min) {
            min = candidates[i].numericValue;
        }
        if (candidates[i].numericValue > max) {
            max = candidates[i].numericValue;
        }
    }
    return { min: min, max: max };
}

function shuffleWithRandomFn(arr, randomFn) {
    var copy = arr.slice(0);
    for (var i = copy.length - 1; i > 0; i--) {
        var j = Math.floor(randomFn() * (i + 1));
        if (j > i) {
            j = i;
        }
        if (j < 0) {
            j = 0;
        }
        var tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
    }
    return copy;
}

/* ------------------------------------------------------------------ *
 * Fraction expression building
 * ------------------------------------------------------------------ */

function formatOperand(r) {
    if (r.den === 1) {
        return String(r.num);
    }
    return r.num + "/" + r.den;
}

function buildFractionExpression(answerRational, fractionSettings, randomFn) {
    if (fractionSettings.answerType === "integer") {
        return buildFractionIntegerExpression(
            answerRational,
            fractionSettings,
            randomFn,
        );
    }

    if (!fractionSettings.allowImproper) {
        if (answerRational.num <= 0 || answerRational.num >= answerRational.den) {
            return null;
        }
    }

    var maxDen = fractionSettings.maxDenominator;
    var maxNum = maxDen * 3;
    var op = fractionSettings.operation;
    var candidates = [];

    if (op === "addition" || op === "subtraction") {
        candidates = buildAddSubCandidates(
            answerRational,
            fractionSettings,
            op,
            maxNum,
            maxDen,
        );
    } else if (op === "multiplication") {
        candidates = buildMulCandidates(
            answerRational,
            maxNum,
            maxDen,
            fractionSettings,
        );
    } else if (op === "division") {
        candidates = buildDivCandidates(
            answerRational,
            maxNum,
            maxDen,
            fractionSettings,
        );
    }

    if (!candidates || candidates.length === 0) {
        return null;
    }
    if (candidates.length > 400) {
        candidates = candidates.slice(0, 400);
    }

    var pick = candidates[Math.floor(randomFn() * candidates.length)];
    // Plain if/else on purpose: ExtendScript mis-evaluates chained ternaries.
    var symbol;
    if (op === "addition") {
        symbol = "+";
    } else if (op === "subtraction") {
        symbol = "-";
    } else if (op === "multiplication") {
        symbol = "x";
    } else {
        symbol = getDivisionSymbol();
    }

    return formatOperand(pick.x) + " " + symbol + " " + formatOperand(pick.y);
}

function buildAddSubCandidates(answer, settings, op, maxNum, maxDen) {
    var preferred = [];
    var fallback = [];
    var allowImproper = settings.allowImproper;
    var requireSimplified = settings.requireSimplified;

    if (settings.sameDenominatorOnly) {
        var maxDenExtended = maxDen * 4;
        for (var d = 2; d <= maxDenExtended; d++) {
            var totalF = ratValue(answer) * d;
            var total = Math.round(totalF);
            if (Math.abs(totalF - total) > 0.0000001) {
                continue;
            }

            if (op === "addition") {
                if (total < 2) {
                    continue;
                }
                for (var a = 1; a < total; a++) {
                    var b = total - a;
                    if (a < 1 || b < 1 || a > maxNum || b > maxNum) {
                        continue;
                    }
                    if (!allowImproper && (a >= d || b >= d)) {
                        continue;
                    }
                    var isReduced = gcd(total, d) === 1;
                    var goesPreferred = requireSimplified ? !isReduced : isReduced;
                    if (d > maxDen) {
                        if (fallback.length < 400) {
                            fallback.push({ x: rawRational(a, d), y: rawRational(b, d) });
                        }
                        continue;
                    }
                    if (goesPreferred) {
                        if (preferred.length < 400) {
                            preferred.push({ x: rawRational(a, d), y: rawRational(b, d) });
                        }
                    } else {
                        if (fallback.length < 400) {
                            fallback.push({ x: rawRational(a, d), y: rawRational(b, d) });
                        }
                    }
                }
            } else {
                for (var yb = 1; yb <= maxNum; yb++) {
                    var xa = yb + total;
                    if (xa < 1 || xa > maxNum) {
                        continue;
                    }
                    if (!allowImproper && (xa >= d || yb >= d)) {
                        continue;
                    }
                    var isReduced2 = gcd(total, d) === 1;
                    var goesPreferred2 = requireSimplified ? !isReduced2 : isReduced2;
                    if (d > maxDen) {
                        if (fallback.length < 400) {
                            fallback.push({ x: rawRational(xa, d), y: rawRational(yb, d) });
                        }
                        continue;
                    }
                    if (goesPreferred2) {
                        if (preferred.length < 400) {
                            preferred.push({ x: rawRational(xa, d), y: rawRational(yb, d) });
                        }
                    } else {
                        if (fallback.length < 400) {
                            fallback.push({ x: rawRational(xa, d), y: rawRational(yb, d) });
                        }
                    }
                }
            }

            if (preferred.length >= 400 && fallback.length >= 400) {
                break;
            }
        }
        return preferred.length > 0 ? preferred : fallback;
    }

    for (var d1 = 2; d1 <= maxDen; d1++) {
        var maxA1 = allowImproper ? maxNum : d1 - 1;
        for (var n1 = 1; n1 <= maxA1; n1++) {
            if (n1 > maxNum) {
                continue;
            }
            var x = makeRational(n1, d1);
            var y = op === "addition" ? ratSub(answer, x) : ratSub(x, answer);
            if (y.num <= 0) {
                continue;
            }
            if (y.den > maxDen || y.den < 2) {
                continue;
            }
            if (y.num > maxNum) {
                continue;
            }
            if (!allowImproper && y.num >= y.den) {
                continue;
            }

            var rawNum =
                op === "addition"
                    ? n1 * y.den + y.num * d1
                    : n1 * y.den - y.num * d1;
            var rawDen = d1 * y.den;
            var isReduced3 = gcd(Math.abs(rawNum), rawDen) === 1;
            var goesPreferred3 = requireSimplified ? !isReduced3 : isReduced3;

            if (goesPreferred3) {
                if (preferred.length < 400) {
                    preferred.push({ x: rawRational(n1, d1), y: y });
                }
            } else {
                if (fallback.length < 400) {
                    fallback.push({ x: rawRational(n1, d1), y: y });
                }
            }

            if (preferred.length >= 400 && fallback.length >= 400) {
                return preferred.length > 0 ? preferred : fallback;
            }
        }
    }
    return preferred.length > 0 ? preferred : fallback;
}

function buildMulCandidates(answer, maxNum, maxDen, settings) {
    var preferred = [];
    var fallback = [];
    var allowImproper = settings.allowImproper;
    var requireSimplified = settings.requireSimplified;

    for (var dx = 2; dx <= maxDen; dx++) {
        var maxNx = allowImproper ? maxNum : dx - 1;
        for (var nx = 1; nx <= maxNx; nx++) {
            var yReduced = makeRational(answer.num * dx, answer.den * nx);
            if (yReduced.num <= 0) {
                continue;
            }
            if (!allowImproper && yReduced.num >= yReduced.den) {
                continue;
            }

            var maxK = Math.floor(maxDen / yReduced.den);
            var maxKByNum = Math.floor(maxNum / yReduced.num);
            if (maxKByNum < maxK) {
                maxK = maxKByNum;
            }

            for (var k = 1; k <= maxK; k++) {
                var ny = yReduced.num * k;
                var dy = yReduced.den * k;
                if (dy < 2) {
                    continue;
                }
                if (!allowImproper && ny >= dy) {
                    continue;
                }

                var rawNum = nx * ny;
                var rawDen = dx * dy;
                var isReduced = gcd(rawNum, rawDen) === 1;
                var goesPreferred = requireSimplified ? !isReduced : isReduced;

                if (goesPreferred) {
                    if (preferred.length < 400) {
                        preferred.push({ x: rawRational(nx, dx), y: rawRational(ny, dy) });
                    }
                } else {
                    if (fallback.length < 400) {
                        fallback.push({ x: rawRational(nx, dx), y: rawRational(ny, dy) });
                    }
                }
                if (preferred.length >= 400 && fallback.length >= 400) {
                    return preferred.length > 0 ? preferred : fallback;
                }
            }
        }
    }

    return preferred.length > 0 ? preferred : fallback;
}

function buildDivCandidates(answer, maxNum, maxDen, settings) {
    var preferred = [];
    var fallback = [];
    var allowImproper = settings.allowImproper;
    var requireSimplified = settings.requireSimplified;

    for (var dy = 2; dy <= maxDen; dy++) {
        var maxNy = allowImproper ? maxNum : dy - 1;
        for (var ny = 1; ny <= maxNy; ny++) {
            var xReduced = makeRational(answer.num * ny, answer.den * dy);
            if (xReduced.num <= 0) {
                continue;
            }
            if (!allowImproper && xReduced.num >= xReduced.den) {
                continue;
            }

            var maxK = Math.floor(maxDen / xReduced.den);
            var maxKByNum = Math.floor(maxNum / xReduced.num);
            if (maxKByNum < maxK) {
                maxK = maxKByNum;
            }

            for (var k = 1; k <= maxK; k++) {
                var nx = xReduced.num * k;
                var dx = xReduced.den * k;
                if (dx < 2) {
                    continue;
                }
                if (!allowImproper && nx >= dx) {
                    continue;
                }

                var rawNum = nx * dy;
                var rawDen = dx * ny;
                var isReduced = gcd(rawNum, rawDen) === 1;
                var goesPreferred = requireSimplified ? !isReduced : isReduced;

                if (goesPreferred) {
                    if (preferred.length < 400) {
                        preferred.push({ x: rawRational(nx, dx), y: rawRational(ny, dy) });
                    }
                } else {
                    if (fallback.length < 400) {
                        fallback.push({ x: rawRational(nx, dx), y: rawRational(ny, dy) });
                    }
                }
                if (preferred.length >= 400 && fallback.length >= 400) {
                    return preferred.length > 0 ? preferred : fallback;
                }
            }
        }
    }

    return preferred.length > 0 ? preferred : fallback;
}

function buildFractionIntegerExpression(answerRational, fractionSettings, randomFn) {
    var k = answerRational.num;
    var maxDen = fractionSettings.maxDenominator;
    var maxW = fractionSettings.maxWholeMultiplier;
    var op = fractionSettings.operation;
    var allowImproper = fractionSettings.allowImproper;
    var texts = [];

    if (op === "multiplication") {
        for (var b = 2; b <= maxDen; b++) {
            var maxA = allowImproper ? maxDen * 3 : b - 1;
            for (var a = 1; a <= maxA; a++) {
                if (a === 0 || (k * b) % a !== 0) {
                    continue;
                }
                var w = (k * b) / a;
                if (w < 1 || w > maxW) {
                    continue;
                }
                texts.push(formatOperand(rawRational(a, b)) + " x " + w);
            }
        }
    } else if (op === "division") {
        for (var b2 = 2; b2 <= maxDen; b2++) {
            var maxA2 = allowImproper ? maxDen * 3 : b2 - 1;
            for (var a2 = 1; a2 <= maxA2; a2++) {
                if (a2 === 0 || (k * a2) % b2 !== 0) {
                    continue;
                }
                var w2 = (k * a2) / b2;
                if (w2 >= 1 && w2 <= maxW) {
                    texts.push(
                        w2 + " " + getDivisionSymbol() + " " + formatOperand(rawRational(a2, b2)),
                    );
                }
            }
        }
        for (var b3 = 2; b3 <= maxDen; b3++) {
            var maxA3 = allowImproper ? maxDen * 3 : b3 - 1;
            for (var d3 = 2; d3 <= maxDen; d3++) {
                var maxC3 = allowImproper ? maxDen * 3 : d3 - 1;
                for (var c3 = 1; c3 <= maxC3; c3++) {
                    var numerA = k * b3 * c3;
                    if (numerA % d3 !== 0) {
                        continue;
                    }
                    var a3 = numerA / d3;
                    if (a3 < 1 || a3 > maxA3) {
                        continue;
                    }
                    texts.push(
                        formatOperand(rawRational(a3, b3)) +
                            " " +
                            getDivisionSymbol() +
                            " " +
                            formatOperand(rawRational(c3, d3)),
                    );
                }
            }
        }
    } else if (op === "addition" || op === "subtraction") {
        for (var d1 = 2; d1 <= maxDen; d1++) {
            var maxN1 = allowImproper ? maxDen * 3 : d1 - 1;
            for (var n1 = 1; n1 <= maxN1; n1++) {
                var x = makeRational(n1, d1);
                var y =
                    op === "addition"
                        ? ratSub(makeRational(k, 1), x)
                        : ratSub(x, makeRational(k, 1));
                if (y.num <= 0) {
                    continue;
                }
                if (y.den < 2 || y.den > maxDen) {
                    continue;
                }
                if (y.num > maxDen * 3) {
                    continue;
                }
                if (!allowImproper && y.num >= y.den) {
                    continue;
                }
                var symbol = op === "addition" ? "+" : "-";
                texts.push(
                    formatOperand(rawRational(n1, d1)) + " " + symbol + " " + formatOperand(y),
                );
            }
        }
    }

    if (texts.length === 0) {
        return null;
    }
    if (texts.length > 400) {
        texts = texts.slice(0, 400);
    }
    return texts[Math.floor(randomFn() * texts.length)];
}

/* ------------------------------------------------------------------ *
 * Dialog
 * ------------------------------------------------------------------ */

function showMainDialog(palette, initialSettings) {
    var dialog = new Window("dialog", "Math Coloring Book Generator", undefined, { resizeable: true });
    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];
    dialog.minimumSize = [700, 380];

    var userEditedMapping = false;
    var userEditedRecommendRange = false;
    var dialogResult = null;
    var rowsList = [];
    var scrollbar = null;
    var listViewHeight = 320;
    var colorListWidth = 394;
    var lastWindowHeight = null;

    var topGroup = dialog.add("group");
    topGroup.orientation = "row";
    topGroup.alignChildren = ["fill", "top"];

    /* ---------------- LEFT COLUMN ---------------- */

    var leftCol = topGroup.add("group");
    leftCol.orientation = "column";
    leftCol.alignChildren = ["fill", "top"];

    var modePanel = leftCol.add("panel", undefined, "Mode");
    modePanel.orientation = "column";
    modePanel.alignChildren = ["fill", "top"];
    modePanel.margins = 8;
    modePanel.spacing = 4;

    var modeDropdown = modePanel.add(
        "dropdownlist",
        undefined,
        ["Fixed table", "Random", "Fractions"],
    );
    var modeKeys = ["fixed", "random", "fraction"];
    modeDropdown.selection = indexOfValue(modeKeys, initialSettings.mode, 0);

    var modeStack = modePanel.add("group");
    modeStack.orientation = "stack";
    modeStack.alignChildren = ["fill", "top"];

    // -- Fixed panel --
    var fixedPanel = modeStack.add("panel", undefined, "Fixed table settings");
    fixedPanel.orientation = "column";
    fixedPanel.alignChildren = ["fill", "top"];
    fixedPanel.margins = 6;
    fixedPanel.spacing = 4;

    var fixedOpGroup = fixedPanel.add("group");
    var fixedMulRadio = fixedOpGroup.add("radiobutton", undefined, "Multiplication");
    var fixedDivRadio = fixedOpGroup.add("radiobutton", undefined, "Division");
    if (initialSettings.fixedOperation === "division") {
        fixedDivRadio.value = true;
    } else {
        fixedMulRadio.value = true;
    }

    var fixedFactorField = addLabeledField(fixedPanel, "Factor", initialSettings.fixedFactor);
    var fixedFactorRange = addLabeledFieldPair(
        fixedPanel,
        "Min factor",
        initialSettings.fixedMinFactor,
        "Max factor",
        initialSettings.fixedMaxFactor,
    );
    var fixedMinFactorField = fixedFactorRange[0];
    var fixedMaxFactorField = fixedFactorRange[1];
    var fixedPreferFirstCheckbox = addCheckbox(
        fixedPanel,
        "Put the fixed factor first",
        initialSettings.fixedPreferFactorFirst,
    );

    var fixedDivisorField = addLabeledField(fixedPanel, "Divisor", initialSettings.fixedDivisor);
    var fixedMaxDividendField = addLabeledField(
        fixedPanel,
        "Max dividend (blank=auto)",
        initialSettings.fixedMaxDividend === null || initialSettings.fixedMaxDividend === undefined
            ? ""
            : initialSettings.fixedMaxDividend,
        150,
    );

    // -- Random panel --
    var randomPanel = modeStack.add("panel", undefined, "Random settings");
    randomPanel.orientation = "column";
    randomPanel.alignChildren = ["fill", "top"];
    randomPanel.margins = 6;
    randomPanel.spacing = 4;

    var randomOpGroup = randomPanel.add("group");
    var randomMulRadio = randomOpGroup.add("radiobutton", undefined, "Multiplication");
    var randomDivRadio = randomOpGroup.add("radiobutton", undefined, "Division");
    var randomMixedRadio = randomOpGroup.add("radiobutton", undefined, "Mixed");
    if (initialSettings.randomOperation === "division") {
        randomDivRadio.value = true;
    } else if (initialSettings.randomOperation === "mixed") {
        randomMixedRadio.value = true;
    } else {
        randomMulRadio.value = true;
    }

    var randomFactorRange = addLabeledFieldPair(
        randomPanel,
        "Min factor",
        initialSettings.randomMinFactor,
        "Max factor",
        initialSettings.randomMaxFactor,
    );
    var randomMinFactorField = randomFactorRange[0];
    var randomMaxFactorField = randomFactorRange[1];
    var randomDivisorRange = addLabeledFieldPair(
        randomPanel,
        "Min divisor",
        initialSettings.randomMinDivisor,
        "Max divisor",
        initialSettings.randomMaxDivisor,
    );
    var randomMinDivisorField = randomDivisorRange[0];
    var randomMaxDivisorField = randomDivisorRange[1];
    var randomMaxDividendField = addLabeledField(randomPanel, "Max dividend", initialSettings.randomMaxDividend);
    var randomizeOrderCheckbox = addCheckbox(
        randomPanel,
        "Randomize operand order",
        initialSettings.randomizeOperandOrder,
    );

    // -- Fraction panel --
    var fractionPanel = modeStack.add("panel", undefined, "Fractions settings");
    fractionPanel.orientation = "column";
    fractionPanel.alignChildren = ["fill", "top"];
    fractionPanel.margins = 6;
    fractionPanel.spacing = 4;

    var fractionOpGroup = fractionPanel.add("group");
    var fractionAddRadio = fractionOpGroup.add("radiobutton", undefined, "Addition");
    var fractionSubRadio = fractionOpGroup.add("radiobutton", undefined, "Subtraction");
    var fractionMulRadio = fractionOpGroup.add("radiobutton", undefined, "Multiplication");
    var fractionDivRadio = fractionOpGroup.add("radiobutton", undefined, "Division");
    if (initialSettings.fractionOperation === "subtraction") {
        fractionSubRadio.value = true;
    } else if (initialSettings.fractionOperation === "multiplication") {
        fractionMulRadio.value = true;
    } else if (initialSettings.fractionOperation === "division") {
        fractionDivRadio.value = true;
    } else {
        fractionAddRadio.value = true;
    }

    var fractionAnswerTypeGroup = fractionPanel.add("group");
    fractionAnswerTypeGroup.add("statictext", undefined, "Answer type:");
    var fractionAnswerFracRadio = fractionAnswerTypeGroup.add("radiobutton", undefined, "Fractions");
    var fractionAnswerIntRadio = fractionAnswerTypeGroup.add("radiobutton", undefined, "Integers");
    if (initialSettings.fractionAnswerType === "integer") {
        fractionAnswerIntRadio.value = true;
    } else {
        fractionAnswerFracRadio.value = true;
    }

    var fractionMaxDenominatorField = addLabeledField(
        fractionPanel,
        "Max denominator",
        initialSettings.fractionMaxDenominator,
    );
    var fractionMaxWholeMultiplierField = addLabeledField(
        fractionPanel,
        "Max whole multiplier",
        initialSettings.fractionMaxWholeMultiplier,
    );
    var fractionRequireSimplifiedCheckbox = addCheckbox(
        fractionPanel,
        "Require simplified result",
        initialSettings.fractionRequireSimplified,
    );
    var fractionSameDenominatorCheckbox = addCheckbox(
        fractionPanel,
        "Same denominators only",
        initialSettings.fractionSameDenominatorOnly,
    );
    var fractionAllowImproperCheckbox = addCheckbox(
        fractionPanel,
        "Allow improper fractions",
        initialSettings.fractionAllowImproper,
    );

    /* ---------------- MID COLUMN ---------------- */

    var midCol = topGroup.add("group");
    midCol.orientation = "column";
    midCol.alignChildren = ["fill", "top"];

    // -- Output panel --
    var outputPanel = midCol.add("panel", undefined, "Output");
    outputPanel.orientation = "column";
    outputPanel.alignChildren = ["fill", "top"];
    outputPanel.margins = 8;
    outputPanel.spacing = 4;

    var textSizeRange = addLabeledFieldPair(
        outputPanel,
        "Text size",
        initialSettings.defaultTextSize,
        "Min text size",
        initialSettings.minTextSize,
    );
    var textSizeField = textSizeRange[0];
    var minTextSizeField = textSizeRange[1];

    var outputCheckboxRow = outputPanel.add("group");
    var rotateTextCheckbox = addCheckbox(
        outputCheckboxRow,
        "Rotate text with shape",
        initialSettings.rotateTextWithShape,
    );
    var autoContrastCheckbox = addCheckbox(
        outputCheckboxRow,
        "Auto text contrast",
        initialSettings.autoTextContrast,
    );

    var legendRow = outputPanel.add("group");
    var createLegendCheckbox = addCheckbox(legendRow, "Create legend", initialSettings.legendEnabled);
    legendRow.add("statictext", undefined, "Columns");
    var legendColumnsField = legendRow.add(
        "edittext",
        undefined,
        initialSettings.legendMaxColumns === null || initialSettings.legendMaxColumns === undefined
            ? ""
            : String(initialSettings.legendMaxColumns),
    );
    legendColumnsField.preferredSize.width = 50;

    var createAnswerKeyCheckbox = addCheckbox(
        outputPanel,
        "Create answer key layer",
        initialSettings.answerKeyEnabled,
    );
    var seedField = addLabeledField(outputPanel, "Random seed", initialSettings.randomSeed, 110);
    var mathTextLayerField = addLabeledField(
        outputPanel,
        "Math text layer",
        initialSettings.mathTextLayerName,
        110,
    );
    mathTextLayerField.preferredSize.width = 120;
    var preprintLayerField = addLabeledField(
        outputPanel,
        "Preprint layer",
        initialSettings.preprintLayerName,
        110,
    );
    preprintLayerField.preferredSize.width = 120;

    /* ---------------- RIGHT COLUMN ---------------- */

    var rightCol = topGroup.add("group");
    rightCol.orientation = "column";
    rightCol.alignChildren = ["fill", "top"];

    var colorsPanel = rightCol.add(
        "panel",
        undefined,
        "Colors in selection (" + palette.length + " unique)",
    );
    colorsPanel.orientation = "column";
    colorsPanel.alignChildren = ["fill", "top"];
    colorsPanel.margins = 8;
    colorsPanel.spacing = 4;
    colorsPanel.preferredSize.width = 424;

    var headerRow = colorsPanel.add("group");
    var headerColor = headerRow.add("statictext", undefined, "Color");
    headerColor.preferredSize.width = 40;
    var headerHex = headerRow.add("statictext", undefined, "");
    headerHex.preferredSize.width = 90;
    var headerCount = headerRow.add("statictext", undefined, "Count");
    headerCount.preferredSize.width = 90;
    var headerAnswer = headerRow.add("statictext", undefined, "Answer");
    headerAnswer.preferredSize.width = 120;

    var scrollOuter = colorsPanel.add("group");
    scrollOuter.orientation = "row";
    scrollOuter.alignChildren = ["fill", "top"];

    var listPanel = scrollOuter.add("panel");
    listPanel.orientation = "column";
    listPanel.alignChildren = ["fill", "top"];
    listPanel.preferredSize = [colorListWidth, listViewHeight];
    listPanel.margins = 2;

    var listGroup = listPanel.add("group");
    listGroup.orientation = "column";
    listGroup.alignChildren = ["fill", "top"];
    listGroup.spacing = 2;

    for (var pIdx = 0; pIdx < palette.length; pIdx++) {
        var row = buildColorRow(listGroup, palette[pIdx]);
        row.answerEdit.onChanging = (function () {
            return function () {
                userEditedMapping = true;
            };
        })();
        rowsList.push(row);
    }

    // Always create the scrollbar, even when the list currently fits: the window
    // is resizable, so a list that fits at open time can still need scrolling
    // after the user shrinks the dialog. When nothing overflows, maxvalue is 0
    // and the scrollbar is simply inert.
    var contentHeight = listGroup.preferredSize.height;
    scrollbar = scrollOuter.add(
        "scrollbar",
        undefined,
        0,
        0,
        Math.max(0, contentHeight - listViewHeight),
    );
    scrollbar.preferredSize.width = 16;
    scrollbar.preferredSize.height = listViewHeight;
    scrollbar.onChanging = function () {
        listGroup.location = [0, -scrollbar.value];
    };

    var listButtonsRow = colorsPanel.add("group");
    var autoFillBtn = listButtonsRow.add("button", undefined, "Auto-fill answers");
    var recommendBtn = listButtonsRow.add("button", undefined, "Recommend answers");
    var clearBtn = listButtonsRow.add("button", undefined, "Clear answers");

    var recommendRangeRow = colorsPanel.add("group");
    recommendRangeRow.orientation = "row";
    recommendRangeRow.add("statictext", undefined, "Recommend range:");
    recommendRangeRow.add("statictext", undefined, "min");
    var recommendMinField = recommendRangeRow.add("edittext", undefined, "1");
    recommendMinField.preferredSize.width = 60;
    recommendRangeRow.add("statictext", undefined, "max");
    var recommendMaxField = recommendRangeRow.add("edittext", undefined, "100");
    recommendMaxField.preferredSize.width = 60;

    /* ---------------- BOTTOM ROW ---------------- */

    var bottomRow = dialog.add("group");
    bottomRow.orientation = "row";
    bottomRow.alignChildren = ["left", "center"];

    var savePresetBtn = bottomRow.add("button", undefined, "Save preset");
    var loadPresetBtn = bottomRow.add("button", undefined, "Load preset");
    var resetDefaultsBtn = bottomRow.add("button", undefined, "Reset defaults");

    var spacer = bottomRow.add("statictext", undefined, "");
    spacer.preferredSize.width = 40;

    var cancelBtn = bottomRow.add("button", undefined, "Cancel");
    var generateBtn = bottomRow.add("button", undefined, "Generate");

    /* ---------------- Helper closures ---------------- */

    function currentModeKey() {
        return modeKeys[modeDropdown.selection ? modeDropdown.selection.index : 0];
    }

    function currentRandomOperation() {
        if (randomDivRadio.value) {
            return "division";
        }
        if (randomMixedRadio.value) {
            return "mixed";
        }
        return "multiplication";
    }

    function currentFractionOperation() {
        if (fractionSubRadio.value) {
            return "subtraction";
        }
        if (fractionMulRadio.value) {
            return "multiplication";
        }
        if (fractionDivRadio.value) {
            return "division";
        }
        return "addition";
    }

    function updateModeVisibility() {
        var mode = currentModeKey();
        fixedPanel.visible = mode === "fixed";
        randomPanel.visible = mode === "random";
        fractionPanel.visible = mode === "fraction";
        fixedPanel.preferredSize = [-1, -1];
        randomPanel.preferredSize = [-1, -1];
        fractionPanel.preferredSize = [-1, -1];
        modeStack.preferredSize = [-1, -1];
        if (modePanel) {
            modePanel.preferredSize = [-1, -1];
        }
        dialog.preferredSize = [-1, -1];
        dialog.layout.layout(true);
        updateRecommendRangeFields();
    }

    function updateFixedFieldStates() {
        var isMul = fixedMulRadio.value;
        fixedFactorField.enabled = isMul;
        fixedMinFactorField.enabled = isMul;
        fixedMaxFactorField.enabled = isMul;
        fixedPreferFirstCheckbox.enabled = isMul;
        fixedDivisorField.enabled = !isMul;
        fixedMaxDividendField.enabled = !isMul;
    }

    function updateRandomFieldStates() {
        var op = currentRandomOperation();
        var mulEnabled = op === "multiplication" || op === "mixed";
        var divEnabled = op === "division" || op === "mixed";
        randomMinFactorField.enabled = mulEnabled;
        randomMaxFactorField.enabled = mulEnabled;
        randomMinDivisorField.enabled = divEnabled;
        randomMaxDivisorField.enabled = divEnabled;
        randomMaxDividendField.enabled = divEnabled;
    }

    function updateFractionFieldStates() {
        var answerIsInteger = fractionAnswerIntRadio.value;
        fractionMaxWholeMultiplierField.enabled = answerIsInteger;

        var op = currentFractionOperation();
        var sameDenomApplicable = op === "addition" || op === "subtraction";
        fractionSameDenominatorCheckbox.enabled = sameDenomApplicable;
    }

    function updateRecommendRangeFields() {
        var mode = currentModeKey();
        var isFixed = mode === "fixed";

        recommendBtn.enabled = !isFixed;
        recommendBtn.helpTip = isFixed
            ? "Fixed table answers are determined by the factor or divisor."
            : "";
        recommendMinField.enabled = !isFixed;
        recommendMaxField.enabled = !isFixed;

        if (isFixed || userEditedRecommendRange) {
            return;
        }

        var settingsForRange = collectSettingsFromUI(false);
        var derived = computeDerivedRecommendRange(mode, settingsForRange);
        if (derived) {
            recommendMinField.text = String(Math.round(derived.min * 10000) / 10000);
            recommendMaxField.text = String(Math.round(derived.max * 10000) / 10000);
        } else {
            recommendMinField.text = "1";
            recommendMaxField.text = "100";
        }
    }

    function collectSettingsFromUI(includeAnswers) {
        var s = {};
        s.mode = currentModeKey();

        s.fixedOperation = fixedMulRadio.value ? "multiplication" : "division";
        s.fixedFactor = parseIntSafe(fixedFactorField.text, CONFIG.fixedFactor);
        s.fixedMinFactor = parseIntSafe(fixedMinFactorField.text, CONFIG.fixedMinFactor);
        s.fixedMaxFactor = parseIntSafe(fixedMaxFactorField.text, CONFIG.fixedMaxFactor);
        s.fixedPreferFactorFirst = fixedPreferFirstCheckbox.value;
        s.fixedDivisor = parseIntSafe(fixedDivisorField.text, CONFIG.fixedDivisor);
        s.fixedMaxDividend =
            trimString(fixedMaxDividendField.text) === ""
                ? null
                : parseIntSafe(fixedMaxDividendField.text, null);

        s.randomOperation = currentRandomOperation();
        s.randomMinFactor = parseIntSafe(randomMinFactorField.text, CONFIG.randomMinFactor);
        s.randomMaxFactor = parseIntSafe(randomMaxFactorField.text, CONFIG.randomMaxFactor);
        s.randomMinDivisor = parseIntSafe(randomMinDivisorField.text, CONFIG.randomMinDivisor);
        s.randomMaxDivisor = parseIntSafe(randomMaxDivisorField.text, CONFIG.randomMaxDivisor);
        s.randomMaxDividend = parseIntSafe(randomMaxDividendField.text, CONFIG.randomMaxDividend);
        s.randomizeOperandOrder = randomizeOrderCheckbox.value;

        s.fractionOperation = currentFractionOperation();
        s.fractionAnswerType = fractionAnswerIntRadio.value ? "integer" : "fraction";
        s.fractionMaxDenominator = parseIntSafe(
            fractionMaxDenominatorField.text,
            CONFIG.fractionMaxDenominator,
        );
        s.fractionMaxWholeMultiplier = parseIntSafe(
            fractionMaxWholeMultiplierField.text,
            CONFIG.fractionMaxWholeMultiplier,
        );
        s.fractionRequireSimplified = fractionRequireSimplifiedCheckbox.value;
        s.fractionSameDenominatorOnly = fractionSameDenominatorCheckbox.value;
        s.fractionAllowImproper = fractionAllowImproperCheckbox.value;

        s.defaultTextSize = parseFloatSafe(textSizeField.text, CONFIG.defaultTextSize);
        s.minTextSize = parseFloatSafe(minTextSizeField.text, CONFIG.minTextSize);
        s.rotateTextWithShape = rotateTextCheckbox.value;
        s.autoTextContrast = autoContrastCheckbox.value;
        s.legendEnabled = createLegendCheckbox.value;
        s.legendMaxColumns = parseIntSafe(legendColumnsField.text, CONFIG.legend.maxColumns);
        s.answerKeyEnabled = createAnswerKeyCheckbox.value;
        s.randomSeed = seedField.text;
        s.mathTextLayerName = mathTextLayerField.text;
        s.preprintLayerName = preprintLayerField.text;

        if (includeAnswers) {
            s.colorAnswers = {};
            for (var i = 0; i < rowsList.length; i++) {
                s.colorAnswers[rowsList[i].hex] = rowsList[i].answerEdit.text;
            }

            s.excludedColors = [];
            for (var j = 0; j < rowsList.length; j++) {
                if (!rowsList[j].includeCheck.value) {
                    s.excludedColors.push(rowsList[j].hex);
                }
            }
        }

        return s;
    }

    function applySettingsToUI(s) {
        modeDropdown.selection = indexOfValue(modeKeys, s.mode, 0);

        if (s.fixedOperation === "division") {
            fixedDivRadio.value = true;
        } else {
            fixedMulRadio.value = true;
        }
        fixedFactorField.text = String(s.fixedFactor);
        fixedMinFactorField.text = String(s.fixedMinFactor);
        fixedMaxFactorField.text = String(s.fixedMaxFactor);
        fixedPreferFirstCheckbox.value = !!s.fixedPreferFactorFirst;
        fixedDivisorField.text = String(s.fixedDivisor);
        fixedMaxDividendField.text =
            s.fixedMaxDividend === null || s.fixedMaxDividend === undefined
                ? ""
                : String(s.fixedMaxDividend);

        if (s.randomOperation === "division") {
            randomDivRadio.value = true;
        } else if (s.randomOperation === "mixed") {
            randomMixedRadio.value = true;
        } else {
            randomMulRadio.value = true;
        }
        randomMinFactorField.text = String(s.randomMinFactor);
        randomMaxFactorField.text = String(s.randomMaxFactor);
        randomMinDivisorField.text = String(s.randomMinDivisor);
        randomMaxDivisorField.text = String(s.randomMaxDivisor);
        randomMaxDividendField.text = String(s.randomMaxDividend);
        randomizeOrderCheckbox.value = !!s.randomizeOperandOrder;

        if (s.fractionOperation === "subtraction") {
            fractionSubRadio.value = true;
        } else if (s.fractionOperation === "multiplication") {
            fractionMulRadio.value = true;
        } else if (s.fractionOperation === "division") {
            fractionDivRadio.value = true;
        } else {
            fractionAddRadio.value = true;
        }
        if (s.fractionAnswerType === "integer") {
            fractionAnswerIntRadio.value = true;
        } else {
            fractionAnswerFracRadio.value = true;
        }
        fractionMaxDenominatorField.text = String(s.fractionMaxDenominator);
        fractionMaxWholeMultiplierField.text = String(s.fractionMaxWholeMultiplier);
        fractionRequireSimplifiedCheckbox.value = !!s.fractionRequireSimplified;
        fractionSameDenominatorCheckbox.value = !!s.fractionSameDenominatorOnly;
        fractionAllowImproperCheckbox.value = !!s.fractionAllowImproper;

        textSizeField.text = String(s.defaultTextSize);
        minTextSizeField.text = String(s.minTextSize);
        rotateTextCheckbox.value = !!s.rotateTextWithShape;
        autoContrastCheckbox.value = !!s.autoTextContrast;
        createLegendCheckbox.value = !!s.legendEnabled;
        legendColumnsField.text = String(s.legendMaxColumns);
        createAnswerKeyCheckbox.value = !!s.answerKeyEnabled;
        seedField.text = s.randomSeed === undefined || s.randomSeed === null ? "" : String(s.randomSeed);
        mathTextLayerField.text =
            s.mathTextLayerName === undefined || s.mathTextLayerName === null
                ? ""
                : String(s.mathTextLayerName);
        preprintLayerField.text =
            s.preprintLayerName === undefined || s.preprintLayerName === null
                ? ""
                : String(s.preprintLayerName);

        for (var rowIdx = 0; rowIdx < rowsList.length; rowIdx++) {
            rowsList[rowIdx].includeCheck.value = !isHexExcluded(s.excludedColors, rowsList[rowIdx].hex);
        }

        updateModeVisibility();
        updateFixedFieldStates();
        updateRandomFieldStates();
        updateFractionFieldStates();
    }

    function runAutoFill() {
        var mode = currentModeKey();
        var settingsForFill = collectSettingsFromUI(false);
        var answers = buildAutoAnswers(mode, settingsForFill, rowsList.length);
        for (var i = 0; i < rowsList.length; i++) {
            rowsList[i].answerEdit.text = answers[i] !== undefined ? answers[i] : "";
        }
    }

    function runAutoFillIfNotEdited() {
        updateRecommendRangeFields();
        if (!userEditedMapping) {
            runAutoFill();
        }
    }

    function overlayColorAnswers(colorAnswers) {
        if (!colorAnswers) {
            return;
        }
        for (var i = 0; i < rowsList.length; i++) {
            var hex = rowsList[i].hex;
            if (colorAnswers.hasOwnProperty(hex) && colorAnswers[hex] !== "") {
                rowsList[i].answerEdit.text = colorAnswers[hex];
            }
        }
    }

    function validateSettings(s) {
        var errors = [];

        for (var i = 0; i < rowsList.length; i++) {
            var hex = rowsList[i].hex;
            var parsed = parseAnswer(s.colorAnswers[hex]);
            if (!parsed.ok) {
                errors.push(hex + ": " + parsed.error);
            }
        }

        if (errors.length > 0) {
            return {
                ok: false,
                message: "Some answers are invalid:\n" + errors.join("\n"),
            };
        }

        var wholeNumberModeErrors = [];
        var wantsWholeNumbers =
            s.mode === "fixed" ||
            s.mode === "random" ||
            (s.mode === "fraction" && s.fractionAnswerType === "integer");

        if (wantsWholeNumbers) {
            for (var j = 0; j < rowsList.length; j++) {
                var hex2 = rowsList[j].hex;
                var parsed2 = parseAnswer(s.colorAnswers[hex2]);
                if (parsed2.ok && parsed2.kind !== "int") {
                    wholeNumberModeErrors.push(hex2);
                }
            }
        }

        if (wholeNumberModeErrors.length > 0) {
            return {
                ok: false,
                message:
                    "This mode requires whole-number answers, but the following colors have a fraction answer:\n" +
                    wholeNumberModeErrors.join(", "),
            };
        }

        return { ok: true };
    }

    /* ---------------- Wiring ---------------- */

    modeDropdown.onChange = function () {
        updateModeVisibility();
        runAutoFill();
    };

    fixedMulRadio.onClick = function () {
        updateFixedFieldStates();
        runAutoFillIfNotEdited();
    };
    fixedDivRadio.onClick = function () {
        updateFixedFieldStates();
        runAutoFillIfNotEdited();
    };

    var fixedFieldsForAutoFill = [
        fixedFactorField,
        fixedMinFactorField,
        fixedMaxFactorField,
        fixedDivisorField,
        fixedMaxDividendField,
    ];
    for (var fi = 0; fi < fixedFieldsForAutoFill.length; fi++) {
        fixedFieldsForAutoFill[fi].onChange = runAutoFillIfNotEdited;
    }
    fixedPreferFirstCheckbox.onClick = runAutoFillIfNotEdited;

    randomMulRadio.onClick = function () {
        updateRandomFieldStates();
        runAutoFillIfNotEdited();
    };
    randomDivRadio.onClick = function () {
        updateRandomFieldStates();
        runAutoFillIfNotEdited();
    };
    randomMixedRadio.onClick = function () {
        updateRandomFieldStates();
        runAutoFillIfNotEdited();
    };

    var randomFieldsForAutoFill = [
        randomMinFactorField,
        randomMaxFactorField,
        randomMinDivisorField,
        randomMaxDivisorField,
        randomMaxDividendField,
    ];
    for (var ri = 0; ri < randomFieldsForAutoFill.length; ri++) {
        randomFieldsForAutoFill[ri].onChange = runAutoFillIfNotEdited;
    }
    randomizeOrderCheckbox.onClick = runAutoFillIfNotEdited;

    var fractionOpRadios = [fractionAddRadio, fractionSubRadio, fractionMulRadio, fractionDivRadio];
    for (var foi = 0; foi < fractionOpRadios.length; foi++) {
        fractionOpRadios[foi].onClick = function () {
            updateFractionFieldStates();
            runAutoFillIfNotEdited();
        };
    }

    fractionAnswerFracRadio.onClick = function () {
        updateFractionFieldStates();
        runAutoFillIfNotEdited();
    };
    fractionAnswerIntRadio.onClick = function () {
        updateFractionFieldStates();
        runAutoFillIfNotEdited();
    };

    var fractionFieldsForAutoFill = [
        fractionMaxDenominatorField,
        fractionMaxWholeMultiplierField,
    ];
    for (var ffi = 0; ffi < fractionFieldsForAutoFill.length; ffi++) {
        fractionFieldsForAutoFill[ffi].onChange = runAutoFillIfNotEdited;
    }
    fractionRequireSimplifiedCheckbox.onClick = runAutoFillIfNotEdited;
    fractionSameDenominatorCheckbox.onClick = runAutoFillIfNotEdited;
    fractionAllowImproperCheckbox.onClick = runAutoFillIfNotEdited;

    autoFillBtn.onClick = function () {
        userEditedMapping = false;
        runAutoFill();
    };

    recommendBtn.onClick = function () {
        var mode = currentModeKey();
        var settingsForFill = collectSettingsFromUI(false);
        settingsForFill.recommendRangeMin = parseFloatSafe(recommendMinField.text, 1);
        settingsForFill.recommendRangeMax = parseFloatSafe(recommendMaxField.text, 100);
        var recommendRandomFn = createRandomFn(settingsForFill.randomSeed);
        var answers = buildRecommendedAnswers(mode, settingsForFill, rowsList.length, recommendRandomFn);
        for (var i = 0; i < rowsList.length; i++) {
            rowsList[i].answerEdit.text = answers[i] !== undefined ? answers[i] : "";
        }
        userEditedMapping = false;
    };

    recommendMinField.onChanging = function () {
        userEditedRecommendRange = true;
    };
    recommendMaxField.onChanging = function () {
        userEditedRecommendRange = true;
    };

    clearBtn.onClick = function () {
        for (var i = 0; i < rowsList.length; i++) {
            rowsList[i].answerEdit.text = "";
        }
        userEditedMapping = true;
    };

    savePresetBtn.onClick = function () {
        var current = collectSettingsFromUI(true);
        var file = File.saveDlg("Save preset", "*.json");
        if (!file) {
            return;
        }
        if (file.name.indexOf(".json") === -1) {
            file = new File(file.fsName + ".json");
        }
        try {
            file.encoding = "UTF-8";
            file.open("w");
            file.write(serializeSettings(current));
            file.close();
        } catch (e) {
            alert("Could not save preset file.");
        }
    };

    loadPresetBtn.onClick = function () {
        var file = File.openDlg("Load preset", "*.json");
        if (!file) {
            return;
        }
        try {
            file.encoding = "UTF-8";
            file.open("r");
            var content = file.read();
            file.close();
            var loaded = parseSettings(content);
            if (loaded) {
                applySettingsToUI(loaded);
                userEditedRecommendRange = false;
                updateRecommendRangeFields();
                runAutoFill();
                overlayColorAnswers(loaded.colorAnswers);
            } else {
                alert("Could not parse preset file.");
            }
        } catch (e) {
            alert("Could not load preset file.");
        }
    };

    resetDefaultsBtn.onClick = function () {
        applySettingsToUI(buildDefaultSettings());
        userEditedMapping = false;
        userEditedRecommendRange = false;
        updateRecommendRangeFields();
        runAutoFill();
    };

    generateBtn.onClick = function () {
        var settings = collectSettingsFromUI(true);
        var validation = validateSettings(settings);
        if (!validation.ok) {
            alert(validation.message);
            return;
        }
        dialogResult = settings;
        dialog.close(1);
    };

    cancelBtn.onClick = function () {
        dialog.close(0);
    };

    /* ---------------- Resizing ---------------- */

    function applyListViewHeight() {
        if (!listPanel || !listGroup) {
            return;
        }
        listPanel.preferredSize = [colorListWidth, listViewHeight];
        if (scrollbar) {
            scrollbar.preferredSize.height = listViewHeight;
            scrollbar.maxvalue = Math.max(0, listGroup.preferredSize.height - listViewHeight);
            if (scrollbar.value > scrollbar.maxvalue) {
                scrollbar.value = scrollbar.maxvalue;
            }
            listGroup.location = [0, -scrollbar.value];
        } else {
            listGroup.location = [0, 0];
        }
    }

    dialog.onResizing = dialog.onResize = function () {
        this.layout.resize();

        try {
            var currentHeight = this.size ? this.size.height : null;
            if (currentHeight === null || currentHeight === undefined) {
                return;
            }
            if (lastWindowHeight === null) {
                lastWindowHeight = currentHeight;
            }
            var delta = currentHeight - lastWindowHeight;
            lastWindowHeight = currentHeight;

            if (listPanel && listGroup) {
                listViewHeight = Math.max(80, listViewHeight + delta);
                applyListViewHeight();
            }

            this.layout.resize();
        } catch (resizeError) {
            // Ignore - best-effort resize handling.
        }
    };

    /* ---------------- Initial state ---------------- */

    updateModeVisibility();
    updateFixedFieldStates();
    updateRandomFieldStates();
    updateFractionFieldStates();
    runAutoFill();
    overlayColorAnswers(initialSettings.colorAnswers);
    for (var initRowIdx = 0; initRowIdx < rowsList.length; initRowIdx++) {
        rowsList[initRowIdx].includeCheck.value = !isHexExcluded(initialSettings.excludedColors, rowsList[initRowIdx].hex);
    }

    var scr = null;
    var screenH = 800;
    var screenW = 1280;
    try {
        scr = ($.screens && $.screens.length) ? $.screens[0] : null;
        screenH = scr ? (scr.bottom - scr.top) : 800;
        screenW = scr ? (scr.right - scr.left) : 1280;
    } catch (screenError) {
        scr = null;
        screenH = 800;
        screenW = 1280;
    }
    var maxDialogH = screenH - 100;

    dialog.layout.layout(true);
    if (dialog.size.height > maxDialogH) {
        listViewHeight = Math.max(100, listViewHeight - (dialog.size.height - maxDialogH));
        applyListViewHeight();
        dialog.layout.layout(true);
    }

    dialog.maximumSize = [screenW - 40, screenH - 40];
    dialog.minimumSize = [700, 300];

    dialog.center();
    try {
        if (scr && dialog.location[1] < scr.top + 20) {
            dialog.location = [dialog.location[0], scr.top + 20];
        }
    } catch (locationError) {
        // Ignore - best-effort positioning.
    }

    var ret = dialog.show();
    if (ret !== 1) {
        return null;
    }
    return dialogResult;
}

function buildColorRow(parent, entry) {
    var row = parent.add("group");
    row.orientation = "row";
    row.alignChildren = ["left", "center"];
    row.spacing = 8;

    var includeCheck = row.add("checkbox", undefined, "");
    includeCheck.value = true;

    var swatch = row.add("panel");
    swatch.preferredSize = [22, 22];
    swatch.minimumSize = [22, 22];
    swatch.maximumSize = [22, 22];

    var rgb = hexToRGBColor(entry.hex);
    swatch.onDraw = function () {
        var g = this.graphics;
        var brush = g.newBrush(
            g.BrushType.SOLID_COLOR,
            [rgb.red / 255, rgb.green / 255, rgb.blue / 255, 1],
        );
        g.rectPath(1, 1, this.size.width - 2, this.size.height - 2);
        g.fillPath(brush);
    };

    var hexText = row.add("statictext", undefined, entry.hex);
    hexText.preferredSize.width = 90;

    var countText = row.add("statictext", undefined, "(" + entry.count + " shapes)");
    countText.preferredSize.width = 90;

    var answerEdit = row.add("edittext", undefined, "");
    answerEdit.preferredSize.width = 110;

    row.answerEdit = answerEdit;
    row.includeCheck = includeCheck;
    row.hex = entry.hex;

    return row;
}

function addLabeledField(parent, label, initialValue, labelWidth) {
    var g = parent.add("group");
    g.orientation = "row";
    var lbl = g.add("statictext", undefined, label);
    lbl.preferredSize.width = labelWidth === null || labelWidth === undefined ? 130 : labelWidth;
    var field = g.add("edittext", undefined, initialValue === null || initialValue === undefined ? "" : String(initialValue));
    field.preferredSize.width = 80;
    return field;
}

function addLabeledFieldPair(parent, label1, value1, label2, value2) {
    var g = parent.add("group");
    g.orientation = "row";
    g.spacing = 6;
    var lbl1 = g.add("statictext", undefined, label1);
    lbl1.preferredSize.width = 70;
    var field1 = g.add("edittext", undefined, value1 === null || value1 === undefined ? "" : String(value1));
    field1.preferredSize.width = 50;
    var lbl2 = g.add("statictext", undefined, label2);
    lbl2.preferredSize.width = 70;
    var field2 = g.add("edittext", undefined, value2 === null || value2 === undefined ? "" : String(value2));
    field2.preferredSize.width = 50;
    return [field1, field2];
}

function addCheckbox(parent, label, initialValue) {
    var cb = parent.add("checkbox", undefined, label);
    cb.value = !!initialValue;
    return cb;
}

function indexOfValue(arr, value, fallback) {
    for (var i = 0; i < arr.length; i++) {
        if (arr[i] === value) {
            return i;
        }
    }
    return fallback;
}

function parseIntSafe(text, fallback) {
    var v = parseInt(text, 10);
    return isNaN(v) ? fallback : v;
}

function parseFloatSafe(text, fallback) {
    var v = parseFloat(text);
    return isNaN(v) ? fallback : v;
}

/* ------------------------------------------------------------------ *
 * Text-fitting pipeline (geometry / layout machinery - unchanged)
 * ------------------------------------------------------------------ */

function duplicateToPreprintLayer(doc, preprintState, pathItem, mathTextLayer) {
    if (!preprintState.layer) {
        preprintState.layer = getOrCreateLayer(doc, CONFIG.preprintLayerName);
        try {
            doc.activeLayer = mathTextLayer;
        } catch (reassertPreprintLayerError) {
            // Ignore.
        }
    }
    var duplicated = pathItem.duplicate(preprintState.layer, ElementPlacement.PLACEATEND);
    ensureItemOnLayer(duplicated, preprintState.layer);
    try {
        doc.activeLayer = mathTextLayer;
    } catch (reassertActiveLayerError) {
        // Ignore.
    }
    return duplicated;
}

function processPathItems(doc, pathItems, preset, randomFn, mathTextLayer) {
    var stats = {
        totalPathItems: pathItems.length,
        processed: 0,
        skippedHiddenOrLocked: 0,
        skippedNonRGB: 0,
        skippedNoMapping: 0,
        skippedExcluded: 0,
        skippedNoExpression: 0,
        preprintShapes: 0,
        excludedPreprintShapes: 0,
        errors: [],
        unmappedHex: [],
        usedEntries: {},
    };

    var answerKeyLayer = null;
    if (CONFIG.answerKey.enabled) {
        answerKeyLayer = getOrCreateLayer(doc, CONFIG.answerKey.layerName);
        try {
            doc.activeLayer = mathTextLayer;
        } catch (reassertAnswerKeyLayerError) {
            // Ignore.
        }
    }

    var preprintState = { layer: null };
    var scratchTextFrame = createScratchTextFrame(mathTextLayer);

    for (var i = 0; i < pathItems.length; i++) {
        var pathItem = pathItems[i];

        if (pathItem.hidden || pathItem.locked) {
            stats.skippedHiddenOrLocked++;
            continue;
        }

        if (!isRGBFill(pathItem)) {
            stats.skippedNonRGB++;
            continue;
        }

        var hexColor = rgbColorToHex(pathItem.fillColor).toUpperCase();

        if (preset.excludedColors && preset.excludedColors.hasOwnProperty("x_" + hexColor)) {
            duplicateToPreprintLayer(doc, preprintState, pathItem, mathTextLayer);
            stats.excludedPreprintShapes++;
            stats.skippedExcluded++;
            continue;
        }

        var answerObj = preset.colorToAnswer[hexColor];

        if (!answerObj) {
            stats.skippedNoMapping++;
            pushUnique(stats.unmappedHex, hexColor);
            continue;
        }

        var expression = buildExpression(answerObj, preset, randomFn);
        if (!expression) {
            stats.skippedNoExpression++;
            continue;
        }

        try {
            var placement = placeExpressionForShape(
                doc,
                mathTextLayer,
                pathItem,
                expression,
                preset.textSize || CONFIG.defaultTextSize,
                pathItem.fillColor,
                scratchTextFrame,
            );

            if (!placement.ok) {
                duplicateToPreprintLayer(doc, preprintState, pathItem, mathTextLayer);
                stats.preprintShapes++;
                continue;
            }

            stats.processed++;
            stats.usedEntries[hexColor] = {
                hex: hexColor,
                num: answerObj.num,
                den: answerObj.den,
                display: answerObj.display,
            };
        } catch (e) {
            stats.errors.push("Place text on pathItem " + (i + 1) + ": " + e);
            continue;
        }

        if (answerKeyLayer) {
            try {
                addAnswerKeyItem(answerKeyLayer, pathItem, expression, answerObj.display);
            } catch (answerKeyError) {
                stats.errors.push("Answer key for pathItem " + (i + 1) + ": " + answerKeyError);
            }
            try {
                doc.activeLayer = mathTextLayer;
            } catch (reassertActiveLayerAfterAnswerKeyError) {
                // Ignore.
            }
        }
    }

    disposeScratchTextFrame(scratchTextFrame);

    groupLayerContents(mathTextLayer, CONFIG.mathTextGroupName);
    groupLayerContents(preprintState.layer, CONFIG.preprintGroupName);
    groupLayerContents(answerKeyLayer, CONFIG.answerKey.groupName);

    if (answerKeyLayer && CONFIG.answerKey.hidden) {
        try {
            answerKeyLayer.visible = false;
        } catch (hideAnswerKeyError) {
            // Ignore.
        }
    }

    return stats;
}

function createLegend(doc, legendEntries) {
    var entries = normalizeLegendEntries(legendEntries);

    if (entries.length === 0) {
        return;
    }

    entries.sort(function (a, b) {
        return b.num / b.den - a.num / a.den;
    });

    var layer = getOrCreateLayer(doc, CONFIG.legend.layerName);

    if (CONFIG.legend.replaceExisting) {
        var existing = findGroupByName(layer, CONFIG.legend.groupName);
        if (existing) {
            existing.remove();
        }
    }

    var group = layer.groupItems.add();
    group.name = CONFIG.legend.groupName;

    var artboardRect =
        doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
    var startLeft = artboardRect[0] + CONFIG.legend.margin;
    var startTop =
        artboardRect[3] + CONFIG.legend.margin + CONFIG.legend.swatchSize + 18;

    if (CONFIG.legend.title) {
        var title = group.textFrames.pointText([startLeft, startTop + 16]);
        title.contents = CONFIG.legend.title;
        title.textRange.size = CONFIG.legend.labelSize + 1;
        title.textRange.fillColor = makeRGBColor(0, 0, 0);
    }

    var maxColumns = CONFIG.legend.maxColumns || 5;
    var col = 0;
    var row = 0;

    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];

        var left = startLeft + col * CONFIG.legend.columnWidth;
        var top = startTop - row * CONFIG.legend.rowHeight;

        var swatch = group.pathItems.rectangle(
            top,
            left,
            CONFIG.legend.swatchSize,
            CONFIG.legend.swatchSize,
        );
        swatch.filled = true;
        swatch.fillColor = hexToRGBColor(entry.hex);
        swatch.stroked = true;
        swatch.strokeWidth = 0.4;
        swatch.strokeColor = makeRGBColor(0, 0, 0);

        if (String(entry.display).indexOf("/") !== -1) {
            var legendElements = parseExpressionElements(entry.display);
            var legendGroup = buildCompositeExpression(group, legendElements, 20, swatch.fillColor);
            var legendBounds = getItemBounds(legendGroup);
            var legendWidth = legendBounds.right - legendBounds.left;
            var legendHeight = legendBounds.top - legendBounds.bottom;
            var legendBoxSize = CONFIG.legend.swatchSize * 0.7;

            if (legendWidth > 0 && legendHeight > 0) {
                var legendScale = Math.min(
                    legendBoxSize / legendWidth,
                    legendBoxSize / legendHeight,
                );
                legendGroup.resize(legendScale * 100, legendScale * 100);
            }

            moveItemBoundsCenterTo(
                legendGroup,
                left + CONFIG.legend.swatchSize / 2,
                top - CONFIG.legend.swatchSize / 2,
            );
        } else {
            var label = group.textFrames.pointText([0, 0]);
            label.contents = entry.display;
            label.textRange.size = CONFIG.legend.labelSize;
            label.textRange.justification = Justification.CENTER;
            label.textRange.leading = CONFIG.legend.labelSize * 1.1;
            label.textRange.baselineShift = 0;
            label.textRange.fillColor = isDarkColor(swatch.fillColor)
                ? makeRGBColor(255, 255, 255)
                : makeRGBColor(0, 0, 0);

            centerPointTextInBox(label, {
                centerX: left + CONFIG.legend.swatchSize / 2,
                centerY: top - CONFIG.legend.swatchSize / 2,
            });
        }

        col++;
        if (col >= maxColumns) {
            col = 0;
            row++;
        }
    }
}

function buildLegendEntriesFromPalette(sortedPalette, colorToAnswer) {
    var entries = [];
    for (var i = 0; i < sortedPalette.length; i++) {
        var hex = sortedPalette[i].hex;
        var answerObj = colorToAnswer[hex];
        if (!answerObj) {
            continue;
        }
        entries.push({
            hex: hex,
            num: answerObj.num,
            den: answerObj.den,
            display: answerObj.display,
        });
    }
    return entries;
}

function normalizeLegendEntries(legendEntries) {
    if (!legendEntries) {
        return [];
    }

    if (legendEntries.length !== undefined) {
        return legendEntries.slice(0);
    }

    var entries = [];
    for (var key in legendEntries) {
        if (legendEntries.hasOwnProperty(key)) {
            entries.push(legendEntries[key]);
        }
    }

    return entries;
}

function addAnswerKeyItem(layer, pathItem, expression, displayAnswer) {
    var bounds = pathItem.geometricBounds; // [left, top, right, bottom]
    var centerX = (bounds[0] + bounds[2]) / 2;
    var centerY = (bounds[1] + bounds[3]) / 2;

    try {
        layer.locked = false;
    } catch (unlockAnswerKeyLayerError) {
        // Ignore.
    }
    try {
        layer.visible = true;
    } catch (unhideAnswerKeyLayerError) {
        // Ignore.
    }

    var text = layer.textFrames.pointText([centerX, centerY]);
    text.contents = expression + " = " + displayAnswer;
    ensureItemOnLayer(text, layer);
    text.textRange.size = CONFIG.answerKey.textSize;
    text.textRange.fillColor = makeRGBColor(180, 20, 20);
}

function buildExpression(answerObj, preset, randomFn) {
    if (preset.mode === "multiplication") {
        return buildMultiplicationExpression(
            answerObj.num,
            preset.multiplication,
            randomFn,
        );
    }

    if (preset.mode === "division") {
        return buildDivisionExpression(answerObj.num, preset.division, randomFn);
    }

    if (preset.mode === "mixed") {
        var options = [];
        var mul = buildMultiplicationExpression(
            answerObj.num,
            preset.multiplication,
            randomFn,
        );
        var div = buildDivisionExpression(answerObj.num, preset.division, randomFn);

        if (mul) {
            options.push(mul);
        }
        if (div) {
            options.push(div);
        }

        if (options.length === 0) {
            return null;
        }

        return options[Math.floor(randomFn() * options.length)];
    }

    if (preset.mode === "fraction") {
        var rational = makeRational(answerObj.num, answerObj.den);
        return buildFractionExpression(rational, preset.fraction, randomFn);
    }

    return null;
}

function buildMultiplicationExpression(answer, config, randomFn) {
    if (!isInteger(answer) || answer <= 0) {
        return null;
    }

    var pairs = [];
    var minFactor = config.minFactor;
    var maxFactor = config.maxFactor;

    for (var a = minFactor; a <= maxFactor; a++) {
        if (a === 0 || answer % a !== 0) {
            continue;
        }

        var b = answer / a;
        if (b < minFactor || b > maxFactor) {
            continue;
        }

        if (config.fixedFactor !== null && config.fixedFactor !== undefined) {
            if (a !== config.fixedFactor && b !== config.fixedFactor) {
                continue;
            }
        }

        pairs.push([a, b]);
    }

    // Fallback when fixed factor is requested but quotient exceeds maxFactor.
    if (
        pairs.length === 0 &&
        config.fixedFactor !== null &&
        config.fixedFactor !== undefined
    ) {
        if (answer % config.fixedFactor === 0) {
            pairs.push([config.fixedFactor, answer / config.fixedFactor]);
        }
    }

    if (pairs.length === 0) {
        return null;
    }

    var pair = pairs[Math.floor(randomFn() * pairs.length)];
    var left = pair[0];
    var right = pair[1];

    if (
        config.preferFixedFactorFirst &&
        config.fixedFactor !== null &&
        config.fixedFactor !== undefined
    ) {
        if (right === config.fixedFactor && left !== config.fixedFactor) {
            var tmpA = left;
            left = right;
            right = tmpA;
        }
    }

    if (config.randomizeOrder && randomFn() < 0.5) {
        var tmp = left;
        left = right;
        right = tmp;
    }

    return left + " x " + right;
}

function buildDivisionExpression(answer, config, randomFn) {
    if (!isInteger(answer) || answer <= 0) {
        return null;
    }

    var candidates = [];
    var divisors = [];

    if (config.fixedDivisor !== null && config.fixedDivisor !== undefined) {
        divisors.push(config.fixedDivisor);
    } else {
        for (var d = config.minDivisor; d <= config.maxDivisor; d++) {
            divisors.push(d);
        }
    }

    for (var i = 0; i < divisors.length; i++) {
        var divisor = divisors[i];
        if (divisor === 0) {
            continue;
        }

        var dividend = answer * divisor;
        if (config.maxDividend && dividend > config.maxDividend) {
            continue;
        }

        candidates.push({ dividend: dividend, divisor: divisor });
    }

    if (candidates.length === 0) {
        return null;
    }

    var pick = candidates[Math.floor(randomFn() * candidates.length)];
    return pick.dividend + " " + getDivisionSymbol() + " " + pick.divisor;
}

function getDivisionSymbol() {
    return String.fromCharCode(247);
}

function formatTextFrame(textFrame, size, fillColor) {
    textFrame.textRange.size = size;
    textFrame.textRange.justification = Justification.CENTER;
    textFrame.textRange.verticalScale = 100;
    textFrame.textRange.leading = size * 1.1;
    textFrame.textRange.baselineShift = 0;

    if (!CONFIG.autoTextContrast) {
        textFrame.textRange.fillColor = makeRGBColor(0, 0, 0);
        return;
    }

    textFrame.textRange.fillColor = isDarkColor(fillColor)
        ? makeRGBColor(255, 255, 255)
        : makeRGBColor(0, 0, 0);
}

function isDarkColor(color) {
    var luma = 0.299 * color.red + 0.587 * color.green + 0.114 * color.blue;
    return luma < CONFIG.darkLumaThreshold;
}

function createFittedTextFrame(
    doc,
    targetLayer,
    pathItem,
    expression,
    baseSize,
    fillColor,
    polygon,
    layoutOptions,
    scratchTextFrame,
) {
    var metrics = getTextMetrics(scratchTextFrame, expression);
    var layoutBox = chooseBestTextLayout(
        doc,
        targetLayer,
        layoutOptions,
        polygon,
        expression,
        baseSize,
        metrics,
    );
    var textFrame = targetLayer.textFrames.pointText([0, 0]);
    textFrame.contents = expression;
    ensureItemOnLayer(textFrame, targetLayer);

    formatTextFrame(textFrame, layoutBox.fittedSize, fillColor);

    centerPointTextInBox(textFrame, layoutBox);

    if (CONFIG.rotateTextWithShape && Math.abs(layoutBox.angle) > 0.01) {
        textFrame.rotate(layoutBox.angle);
        centerPointTextInBox(textFrame, layoutBox);
    }

    // Verification with fallback: the analytic size was computed from cached
    // point-size metrics, so confirm it against the real, rendered frame once.
    // If it does not actually fit, fall back to the existing stepwise shrink
    // loop on the real frame so output can never regress.
    if (!doesTextFitLayout(textFrame, layoutBox, polygon)) {
        var verifiedSize = fitPointTextSize(textFrame, layoutBox, baseSize, polygon);
        layoutBox.fittedSize = verifiedSize;
        centerPointTextInBox(textFrame, layoutBox);
        layoutBox.fits = doesTextFitLayout(textFrame, layoutBox, polygon);
    }

    return { textFrame: textFrame, layoutBox: layoutBox };
}

/* ------------------------------------------------------------------ *
 * Stacked (vulgar) fraction rendering + preprint-shape handling
 * ------------------------------------------------------------------ */

function placeExpressionForShape(doc, targetLayer, pathItem, expression, baseSize, fillColor, scratchTextFrame) {
    try {
        doc.activeLayer = targetLayer;
    } catch (reassertTargetLayerError) {
        // Ignore.
    }

    var polygon = getPolygonAnchors(pathItem);
    var layoutOptions = getTextLayoutCandidates(pathItem, polygon);

    if (expression.indexOf("/") === -1) {
        var result = createFittedTextFrame(
            doc,
            targetLayer,
            pathItem,
            expression,
            baseSize,
            fillColor,
            polygon,
            layoutOptions,
            scratchTextFrame,
        );
        var layoutBox = result.layoutBox;

        if (!layoutBox.fits || layoutBox.fittedSize < (CONFIG.minTextSize || 4)) {
            result.textFrame.remove();
            return { ok: false, reason: "preprint" };
        }

        return { ok: true };
    }

    var elements = parseExpressionElements(expression);
    var group = placeCompositeExpression(
        doc,
        targetLayer,
        pathItem,
        elements,
        layoutOptions,
        polygon,
        baseSize,
        fillColor,
    );

    if (!group) {
        return { ok: false, reason: "preprint" };
    }

    return { ok: true };
}

function parseExpressionElements(expression) {
    var tokens = String(expression).split(" ");
    var divSymbol = String.fromCharCode(247);
    var fracRe = /^(\d+)\/(\d+)$/;
    var intRe = /^\d+$/;
    var elements = [];

    var i = 0;
    while (i < tokens.length) {
        var tok = tokens[i];

        if (tok === "+" || tok === "-" || tok === "x" || tok === divSymbol) {
            elements.push({ type: "op", text: tok });
            i++;
            continue;
        }

        var fracMatch = tok.match(fracRe);
        if (fracMatch) {
            elements.push({ type: "frac", num: fracMatch[1], den: fracMatch[2] });
            i++;
            continue;
        }

        if (intRe.test(tok)) {
            var nextTok = tokens[i + 1];
            var nextFracMatch = nextTok ? nextTok.match(fracRe) : null;
            if (nextFracMatch) {
                elements.push({
                    type: "mixed",
                    whole: tok,
                    num: nextFracMatch[1],
                    den: nextFracMatch[2],
                });
                i += 2;
                continue;
            }
            elements.push({ type: "int", text: tok });
            i++;
            continue;
        }

        // Fallback for any unrecognized token - keep it as an "op" so nothing is lost.
        elements.push({ type: "op", text: tok });
        i++;
    }

    return elements;
}

function moveItemBoundsCenterTo(item, targetCenterX, targetCenterY) {
    var bounds = getItemBounds(item);
    var currentCenterX = (bounds.left + bounds.right) / 2;
    var currentCenterY = (bounds.top + bounds.bottom) / 2;
    var pos = item.position;
    item.position = [
        pos[0] + (targetCenterX - currentCenterX),
        pos[1] + (targetCenterY - currentCenterY),
    ];
}

function computeAutoTextColor(fillColor) {
    if (!CONFIG.autoTextContrast) {
        return makeRGBColor(0, 0, 0);
    }
    return isDarkColor(fillColor) ? makeRGBColor(255, 255, 255) : makeRGBColor(0, 0, 0);
}

function buildFractionSubgroup(container, numText, denText, referenceSize, fillColor) {
    var subGroup = container.groupItems.add();

    var numTf = subGroup.textFrames.pointText([0, 0]);
    numTf.contents = numText;
    formatTextFrame(numTf, referenceSize, fillColor);

    var denTf = subGroup.textFrames.pointText([0, 0]);
    denTf.contents = denText;
    formatTextFrame(denTf, referenceSize, fillColor);

    var numBounds = getItemBounds(numTf);
    var denBounds = getItemBounds(denTf);
    var numWidth = numBounds.right - numBounds.left;
    var denWidth = denBounds.right - denBounds.left;
    var numHeight = numBounds.top - numBounds.bottom;
    var denHeight = denBounds.top - denBounds.bottom;

    var barThickness = referenceSize * 0.09;
    var barWidth = Math.max(numWidth, denWidth) * 1.2;
    var gap = referenceSize * 0.12;
    var barTop = barThickness / 2;
    var barBottom = -barThickness / 2;

    var bar = subGroup.pathItems.rectangle(barTop, -barWidth / 2, barWidth, barThickness);
    bar.filled = true;
    bar.fillColor = computeAutoTextColor(fillColor);
    bar.stroked = false;

    moveItemBoundsCenterTo(numTf, 0, barTop + gap + numHeight / 2);
    moveItemBoundsCenterTo(denTf, 0, barBottom - gap - denHeight / 2);

    var groupBounds = getItemBounds(subGroup);

    return {
        group: subGroup,
        bounds: groupBounds,
        width: groupBounds.right - groupBounds.left,
    };
}

function buildCompositeExpression(container, elements, referenceSize, fillColor) {
    var outerGroup = container.groupItems.add();
    var elementGap = referenceSize * 0.35;
    var mixedGap = referenceSize * 0.15;
    var built = [];

    for (var i = 0; i < elements.length; i++) {
        var el = elements[i];

        if (el.type === "op" || el.type === "int") {
            var tf = outerGroup.textFrames.pointText([0, 0]);
            tf.contents = el.text;
            formatTextFrame(tf, referenceSize, fillColor);
            moveItemBoundsCenterTo(tf, 0, 0);
            var tfBounds = getItemBounds(tf);
            built.push({ items: [tf], width: tfBounds.right - tfBounds.left });
        } else if (el.type === "frac") {
            var fr = buildFractionSubgroup(outerGroup, el.num, el.den, referenceSize, fillColor);
            built.push({ items: [fr.group], width: fr.width });
        } else if (el.type === "mixed") {
            var wholeTf = outerGroup.textFrames.pointText([0, 0]);
            wholeTf.contents = el.whole;
            formatTextFrame(wholeTf, referenceSize, fillColor);
            moveItemBoundsCenterTo(wholeTf, 0, 0);
            var wholeBounds = getItemBounds(wholeTf);
            var wholeWidth = wholeBounds.right - wholeBounds.left;

            var fr2 = buildFractionSubgroup(outerGroup, el.num, el.den, referenceSize, fillColor);
            var fracWidth = fr2.width;

            var wholeCenterX = -(mixedGap + fracWidth) / 2;
            var fracCenterX = (mixedGap + wholeWidth) / 2;

            moveItemBoundsCenterTo(wholeTf, wholeCenterX, 0);
            moveItemBoundsCenterTo(fr2.group, fracCenterX, 0);

            built.push({
                items: [wholeTf, fr2.group],
                width: wholeWidth + mixedGap + fracWidth,
            });
        }
    }

    var totalWidth = 0;
    for (var j = 0; j < built.length; j++) {
        totalWidth += built[j].width;
    }
    if (built.length > 1) {
        totalWidth += elementGap * (built.length - 1);
    }

    var cursorX = -totalWidth / 2;
    for (var k = 0; k < built.length; k++) {
        var width = built[k].width;
        var centerX = cursorX + width / 2;
        for (var m = 0; m < built[k].items.length; m++) {
            var item = built[k].items[m];
            var pos = item.position;
            item.position = [pos[0] + centerX, pos[1]];
        }
        cursorX += width + elementGap;
    }

    return outerGroup;
}

function placeCompositeExpression(doc, targetLayer, pathItem, elements, layoutOptions, polygon, baseSize, fillColor) {
    var referenceSize = 20;
    var group = buildCompositeExpression(targetLayer, elements, referenceSize, fillColor);
    var groupBounds = getItemBounds(group);
    var groupWidth = groupBounds.right - groupBounds.left;
    var groupHeight = groupBounds.top - groupBounds.bottom;

    var sortedOptions = layoutOptions.slice(0).sort(function (a, b) {
        return b.area - a.area;
    });

    for (var i = 0; i < sortedOptions.length; i++) {
        var layoutBox = sortedOptions[i];

        if (groupWidth <= 0 || groupHeight <= 0) {
            continue;
        }

        var scale = Math.min(
            layoutBox.width / groupWidth,
            layoutBox.height / groupHeight,
        );
        var effectiveSize = referenceSize * scale;

        if (effectiveSize < (CONFIG.minTextSize || 4)) {
            continue;
        }

        var scaledWidth = groupWidth * scale;
        var scaledHeight = groupHeight * scale;
        var angle = CONFIG.rotateTextWithShape ? layoutBox.angle : 0;

        if (
            !doesOrientedRectFitPolygon(
                layoutBox.centerX,
                layoutBox.centerY,
                scaledWidth,
                scaledHeight,
                angle,
                polygon,
            )
        ) {
            continue;
        }

        group.resize(scale * 100, scale * 100);

        if (CONFIG.rotateTextWithShape && Math.abs(layoutBox.angle) > 0.01) {
            group.rotate(layoutBox.angle);
        }

        moveItemBoundsCenterTo(group, layoutBox.centerX, layoutBox.centerY);

        ensureItemOnLayer(group, targetLayer);

        return group;
    }

    group.remove();
    return null;
}

function chooseBestTextLayout(
    doc,
    targetLayer,
    layoutOptions,
    polygon,
    expression,
    baseSize,
    metrics,
) {
    var preferredHorizontal = findPreferredHorizontalLayout(
        doc,
        targetLayer,
        layoutOptions,
        polygon,
        expression,
        baseSize,
        metrics,
    );
    if (preferredHorizontal) {
        return preferredHorizontal;
    }

    var best = null;

    for (var i = 0; i < layoutOptions.length; i++) {
        var fittedSize = computeFittedSize(
            metrics,
            layoutOptions[i],
            baseSize,
            polygon,
        );

        var candidate = shallowCopy(layoutOptions[i]);
        candidate.fittedSize = fittedSize;
        candidate.fits = doesMetricsFitLayout(
            metrics,
            fittedSize,
            layoutOptions[i],
            polygon,
        );

        if (!best || isBetterLayoutCandidate(candidate, best)) {
            best = candidate;
        }
    }

    if (!best) {
        var fallback = buildFallbackTextBoxFromPolygon(polygon);
        fallback.fittedSize = CONFIG.minTextSize || 4;
        return fallback;
    }

    return best;
}

function findPreferredHorizontalLayout(
    doc,
    targetLayer,
    layoutOptions,
    polygon,
    expression,
    baseSize,
    metrics,
) {
    var best = null;

    for (var i = 0; i < layoutOptions.length; i++) {
        if (!isHorizontalLayout(layoutOptions[i])) {
            continue;
        }

        if (doesMetricsFitLayout(metrics, baseSize, layoutOptions[i], polygon)) {
            var candidate = shallowCopy(layoutOptions[i]);
            candidate.fittedSize = baseSize;
            candidate.fits = true;

            if (!best || candidate.area > best.area) {
                best = candidate;
            }
        }
    }

    return best;
}

function isHorizontalLayout(layoutBox) {
    return Math.abs(layoutBox.angle || 0) < 0.01;
}

function isBetterLayoutCandidate(candidate, currentBest) {
    if (candidate.fits && !currentBest.fits) {
        return true;
    }

    if (!candidate.fits && currentBest.fits) {
        return false;
    }

    if (candidate.fittedSize > currentBest.fittedSize + 0.001) {
        return true;
    }

    if (candidate.fittedSize + 0.001 < currentBest.fittedSize) {
        return false;
    }

    return candidate.area > currentBest.area;
}

function fitPointTextSize(textFrame, layoutBox, baseSize, polygon) {
    var currentSize = baseSize;
    var minSize = CONFIG.minTextSize || 4;
    var emergencyMinSize = CONFIG.emergencyMinTextSize || minSize;
    if (emergencyMinSize > minSize) {
        emergencyMinSize = minSize;
    }

    setTextFrameSize(textFrame, currentSize);

    while (currentSize > minSize) {
        if (doesTextFitLayout(textFrame, layoutBox, polygon)) {
            break;
        }

        currentSize -= 0.25;
        setTextFrameSize(textFrame, currentSize);
    }

    while (
        currentSize > emergencyMinSize &&
        !doesTextFitLayout(textFrame, layoutBox, polygon)
    ) {
        currentSize -= 0.25;
        setTextFrameSize(textFrame, currentSize);
    }

    if (currentSize < emergencyMinSize) {
        currentSize = emergencyMinSize;
        setTextFrameSize(textFrame, currentSize);
    }

    return currentSize;
}

function setTextFrameSize(textFrame, size) {
    textFrame.textRange.size = size;
    textFrame.textRange.leading = size * 1.1;
}

function doesTextFitLayout(textFrame, layoutBox, polygon) {
    var textBounds = getItemBounds(textFrame);
    var textWidth = textBounds.right - textBounds.left;
    var textHeight = textBounds.top - textBounds.bottom;
    var angle = CONFIG.rotateTextWithShape ? layoutBox.angle : 0;

    if (textWidth > layoutBox.width || textHeight > layoutBox.height) {
        return false;
    }

    if (!polygon || polygon.length < 3) {
        return true;
    }

    return doesOrientedRectFitPolygon(
        layoutBox.centerX,
        layoutBox.centerY,
        textWidth,
        textHeight,
        angle,
        polygon,
    );
}

function getTextMetrics(scratchFrame, expression) {
    var key = "e_" + expression;
    if (TEXT_METRICS_CACHE.hasOwnProperty(key)) {
        return TEXT_METRICS_CACHE[key];
    }

    scratchFrame.contents = expression;
    setTextFrameSize(scratchFrame, TEXT_METRICS_REF_SIZE);
    var bounds = getItemBounds(scratchFrame);
    var metrics = {
        width: bounds.right - bounds.left,
        height: bounds.top - bounds.bottom,
    };

    TEXT_METRICS_CACHE[key] = metrics;
    return metrics;
}

function createScratchTextFrame(targetLayer) {
    return targetLayer.textFrames.pointText([0, 0]);
}

function disposeScratchTextFrame(frame) {
    try {
        frame.remove();
    } catch (disposeScratchTextFrameError) {
        // Ignore.
    }
}

function doesMetricsFitLayout(metrics, size, layoutBox, polygon) {
    var textWidth = (metrics.width * size) / TEXT_METRICS_REF_SIZE;
    var textHeight = (metrics.height * size) / TEXT_METRICS_REF_SIZE;
    var angle = CONFIG.rotateTextWithShape ? layoutBox.angle : 0;

    if (textWidth > layoutBox.width || textHeight > layoutBox.height) {
        return false;
    }

    if (!polygon || polygon.length < 3) {
        return true;
    }

    return doesOrientedRectFitPolygon(
        layoutBox.centerX,
        layoutBox.centerY,
        textWidth,
        textHeight,
        angle,
        polygon,
    );
}

function computeFittedSize(metrics, layoutBox, baseSize, polygon) {
    var minSize = CONFIG.minTextSize || 4;
    var emergencyMinSize = CONFIG.emergencyMinTextSize || minSize;
    if (emergencyMinSize > minSize) {
        emergencyMinSize = minSize;
    }

    var scaledWidthAtBase = (metrics.width * baseSize) / TEXT_METRICS_REF_SIZE;
    var scaledHeightAtBase = (metrics.height * baseSize) / TEXT_METRICS_REF_SIZE;

    var scale = Math.min(
        layoutBox.width / scaledWidthAtBase,
        layoutBox.height / scaledHeightAtBase,
    );

    var currentSize = baseSize * scale;
    if (currentSize > baseSize) {
        currentSize = baseSize;
    }
    currentSize = Math.floor(currentSize * 4) / 4;

    while (currentSize > minSize) {
        if (doesMetricsFitLayout(metrics, currentSize, layoutBox, polygon)) {
            break;
        }

        currentSize -= 0.25;
    }

    while (
        currentSize > emergencyMinSize &&
        !doesMetricsFitLayout(metrics, currentSize, layoutBox, polygon)
    ) {
        currentSize -= 0.25;
    }

    if (currentSize < emergencyMinSize) {
        currentSize = emergencyMinSize;
    }

    return currentSize;
}

function centerPointTextInBox(textFrame, layoutBox) {
    var textBounds = getItemBounds(textFrame);
    var currentCenterX = (textBounds.left + textBounds.right) / 2;
    var currentCenterY = (textBounds.top + textBounds.bottom) / 2;
    var deltaX = layoutBox.centerX - currentCenterX;
    var deltaY = layoutBox.centerY - currentCenterY;
    var position = textFrame.position;

    textFrame.position = [position[0] + deltaX, position[1] + deltaY];
}

function getBestTextLayoutBox(pathItem) {
    var candidates = getTextLayoutCandidates(
        pathItem,
        getPolygonAnchors(pathItem),
    );
    return candidates.length > 0
        ? candidates[0]
        : buildFallbackTextBox(pathItem);
}

function getTextLayoutCandidates(pathItem, polygon) {
    if (polygon.length < 3) {
        return [buildFallbackTextBox(pathItem)];
    }

    var angles = CONFIG.rotateTextWithShape ? getCandidateAngles(polygon) : [0];
    var candidates = [];

    for (var i = 0; i < angles.length; i++) {
        var rotated = rotatePoints(polygon, -angles[i]);
        var localBox = findLargestAxisAlignedInnerBox(rotated);

        if (!localBox) {
            continue;
        }

        candidates.push(convertLocalBoxToLayoutBox(localBox, angles[i]));
    }

    if (candidates.length === 0) {
        return [buildFallbackTextBox(pathItem)];
    }

    candidates.sort(function (a, b) {
        return b.area - a.area;
    });

    return candidates;
}

function convertLocalBoxToLayoutBox(localBox, angle) {
    var localCenter = {
        x: (localBox.left + localBox.right) / 2,
        y: (localBox.bottom + localBox.top) / 2,
    };
    var globalCenter = rotatePoint(localCenter, angle);
    var width = (localBox.right - localBox.left) * CONFIG.textBoxPaddingRatio;
    var height =
        (localBox.top - localBox.bottom) * CONFIG.textHeightPaddingRatio;

    return {
        centerX: globalCenter.x,
        centerY: globalCenter.y,
        width: width,
        height: height,
        angle: angle,
        area: width * height,
    };
}

function buildFallbackTextBox(pathItem) {
    var bounds = pathItem.geometricBounds;
    var width = (bounds[2] - bounds[0]) * 0.7;
    var height = (bounds[1] - bounds[3]) * 0.45;

    return {
        centerX: (bounds[0] + bounds[2]) / 2,
        centerY: (bounds[1] + bounds[3]) / 2,
        width: width,
        height: height,
        angle: 0,
        area: width * height,
    };
}

function buildFallbackTextBoxFromPolygon(polygon) {
    if (!polygon || polygon.length === 0) {
        return {
            centerX: 0,
            centerY: 0,
            width: 10,
            height: 10,
            angle: 0,
            area: 100,
        };
    }

    var minX = polygon[0].x;
    var maxX = polygon[0].x;
    var minY = polygon[0].y;
    var maxY = polygon[0].y;

    for (var i = 1; i < polygon.length; i++) {
        if (polygon[i].x < minX) {
            minX = polygon[i].x;
        }
        if (polygon[i].x > maxX) {
            maxX = polygon[i].x;
        }
        if (polygon[i].y < minY) {
            minY = polygon[i].y;
        }
        if (polygon[i].y > maxY) {
            maxY = polygon[i].y;
        }
    }

    var width = (maxX - minX) * 0.7;
    var height = (maxY - minY) * 0.45;

    return {
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
        width: width,
        height: height,
        angle: 0,
        area: width * height,
    };
}

function getPolygonAnchors(pathItem) {
    var anchors = [];
    var pathPoints = pathItem.pathPoints;
    var pathPointsLength = pathPoints.length;

    if (!pathItem.closed || pathPointsLength < 3) {
        return anchors;
    }

    for (var i = 0; i < pathPointsLength; i++) {
        var anchor = pathPoints[i].anchor;
        anchors.push({ x: anchor[0], y: anchor[1] });
    }

    return anchors;
}

function getCandidateAngles(points) {
    var seen = {};
    var angles = [0];

    for (var i = 0; i < points.length; i++) {
        var next = (i + 1) % points.length;
        var dx = points[next].x - points[i].x;
        var dy = points[next].y - points[i].y;

        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
            continue;
        }

        var angle = normalizeAngle180((Math.atan2(dy, dx) * 180) / Math.PI);
        var key = String(Math.round(angle * 1000) / 1000);
        if (!seen[key]) {
            seen[key] = true;
            angles.push(angle);
        }
    }

    return angles;
}

function normalizeAngle180(angle) {
    while (angle < -90) {
        angle += 180;
    }

    while (angle > 90) {
        angle -= 180;
    }

    return angle;
}

function rotatePoints(points, angleDegrees) {
    var rotated = [];
    for (var i = 0; i < points.length; i++) {
        rotated.push(rotatePoint(points[i], angleDegrees));
    }
    return rotated;
}

function rotatePoint(point, angleDegrees) {
    var radians = (angleDegrees * Math.PI) / 180;
    var cos = Math.cos(radians);
    var sin = Math.sin(radians);

    return {
        x: point.x * cos - point.y * sin,
        y: point.x * sin + point.y * cos,
    };
}

function findLargestAxisAlignedInnerBox(points) {
    var sampleYs = buildSampleYValues(points);
    if (sampleYs.length < 2) {
        return null;
    }

    var intervalsBySampleY = [];
    for (var s = 0; s < sampleYs.length; s++) {
        intervalsBySampleY.push(getHorizontalIntervals(points, sampleYs[s]));
    }

    var best = null;

    for (var start = 0; start < sampleYs.length - 1; start++) {
        var overlapIntervals = intervalsBySampleY[start];
        if (overlapIntervals.length === 0) {
            continue;
        }

        for (var end = start + 1; end < sampleYs.length; end++) {
            var y = sampleYs[end];
            var intervals = intervalsBySampleY[end];
            if (intervals.length === 0) {
                break;
            }

            overlapIntervals = intersectIntervalSets(
                overlapIntervals,
                intervals,
            );
            if (overlapIntervals.length === 0) {
                break;
            }

            var height = sampleYs[end] - sampleYs[start];
            if (height <= 0) {
                continue;
            }

            for (var i = 0; i < overlapIntervals.length; i++) {
                var span = overlapIntervals[i].right - overlapIntervals[i].left;
                if (span <= 0) {
                    continue;
                }

                var area = span * height;
                if (!best || area > best.area) {
                    best = {
                        left: overlapIntervals[i].left,
                        right: overlapIntervals[i].right,
                        bottom: sampleYs[start],
                        top: sampleYs[end],
                        area: area,
                    };
                }
            }
        }
    }

    return best;
}

function buildSampleYValues(points) {
    var minY = points[0].y;
    var maxY = points[0].y;
    var values = [];
    var seen = {};
    var samples = CONFIG.innerBoxSamples || 28;

    for (var i = 0; i < points.length; i++) {
        if (points[i].y < minY) {
            minY = points[i].y;
        }
        if (points[i].y > maxY) {
            maxY = points[i].y;
        }

        addUniqueNumber(values, seen, points[i].y);
    }

    if (maxY - minY < 0.01) {
        return values;
    }

    for (var step = 0; step <= samples; step++) {
        var y = minY + ((maxY - minY) * step) / samples;
        addUniqueNumber(values, seen, y);
    }

    values.sort(function (a, b) {
        return a - b;
    });

    return values;
}

function addUniqueNumber(values, seen, value) {
    var key = String(Math.round(value * 1000) / 1000);
    if (!seen[key]) {
        seen[key] = true;
        values.push(value);
    }
}

function getHorizontalIntervals(points, y) {
    var intersections = [];
    var epsilon = 0.0001;

    for (var i = 0; i < points.length; i++) {
        var a = points[i];
        var b = points[(i + 1) % points.length];

        if (Math.abs(a.y - b.y) < epsilon) {
            continue;
        }

        var minY = Math.min(a.y, b.y);
        var maxY = Math.max(a.y, b.y);

        if (y < minY || y >= maxY) {
            continue;
        }

        var t = (y - a.y) / (b.y - a.y);
        if (t < 0 || t > 1) {
            continue;
        }

        intersections.push(a.x + (b.x - a.x) * t);
    }

    if (intersections.length < 2) {
        return [];
    }

    intersections.sort(function (a, b) {
        return a - b;
    });

    intersections = dedupeSortedNumbers(intersections, epsilon);

    var intervals = [];
    for (var j = 0; j + 1 < intersections.length; j += 2) {
        if (intersections[j + 1] - intersections[j] > epsilon) {
            intervals.push({
                left: intersections[j],
                right: intersections[j + 1],
            });
        }
    }

    return intervals;
}

function intersectIntervalSets(setA, setB) {
    var intersections = [];
    var i = 0;
    var j = 0;

    while (i < setA.length && j < setB.length) {
        var left = Math.max(setA[i].left, setB[j].left);
        var right = Math.min(setA[i].right, setB[j].right);

        if (right > left) {
            intersections.push({
                left: left,
                right: right,
            });
        }

        if (setA[i].right < setB[j].right) {
            i++;
        } else {
            j++;
        }
    }

    return intersections;
}

function dedupeSortedNumbers(values, epsilon) {
    if (values.length === 0) {
        return values;
    }

    var result = [values[0]];
    for (var i = 1; i < values.length; i++) {
        if (Math.abs(values[i] - result[result.length - 1]) > epsilon) {
            result.push(values[i]);
        }
    }

    return result;
}

function getItemBounds(item) {
    var bounds = item.visibleBounds || item.geometricBounds;
    return {
        left: bounds[0],
        top: bounds[1],
        right: bounds[2],
        bottom: bounds[3],
    };
}

function doesOrientedRectFitPolygon(
    centerX,
    centerY,
    width,
    height,
    angleDegrees,
    polygon,
) {
    var center = { x: centerX, y: centerY };
    if (!isPointInsidePolygon(center, polygon)) {
        return false;
    }

    var corners = getOrientedRectCorners(
        centerX,
        centerY,
        width,
        height,
        angleDegrees,
    );

    for (var i = 0; i < corners.length; i++) {
        if (!isPointInsidePolygon(corners[i], polygon)) {
            return false;
        }
    }

    for (var edgeIndex = 0; edgeIndex < corners.length; edgeIndex++) {
        var rectStart = corners[edgeIndex];
        var rectEnd = corners[(edgeIndex + 1) % corners.length];

        for (var polyIndex = 0; polyIndex < polygon.length; polyIndex++) {
            var polyStart = polygon[polyIndex];
            var polyEnd = polygon[(polyIndex + 1) % polygon.length];

            if (segmentsIntersect(rectStart, rectEnd, polyStart, polyEnd)) {
                return false;
            }
        }
    }

    return true;
}

function getOrientedRectCorners(centerX, centerY, width, height, angleDegrees) {
    var halfWidth = width / 2;
    var halfHeight = height / 2;
    var corners = [
        { x: -halfWidth, y: halfHeight },
        { x: halfWidth, y: halfHeight },
        { x: halfWidth, y: -halfHeight },
        { x: -halfWidth, y: -halfHeight },
    ];
    var result = [];

    for (var i = 0; i < corners.length; i++) {
        var rotated = rotatePoint(corners[i], angleDegrees);
        result.push({
            x: centerX + rotated.x,
            y: centerY + rotated.y,
        });
    }

    return result;
}

function isPointInsidePolygon(point, polygon) {
    var epsilon = 0.01;
    var inside = false;

    for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        if (distancePointToSegment(point, polygon[j], polygon[i]) <= epsilon) {
            return true;
        }

        var yiAbove = polygon[i].y > point.y;
        var yjAbove = polygon[j].y > point.y;

        if (yiAbove !== yjAbove) {
            var intersectX =
                ((polygon[j].x - polygon[i].x) * (point.y - polygon[i].y)) /
                    (polygon[j].y - polygon[i].y) +
                polygon[i].x;

            if (point.x < intersectX) {
                inside = !inside;
            }
        }
    }

    return inside;
}

function distancePointToSegment(point, start, end) {
    var dx = end.x - start.x;
    var dy = end.y - start.y;

    if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) {
        return distanceBetweenPoints(point, start);
    }

    var t =
        ((point.x - start.x) * dx + (point.y - start.y) * dy) /
        (dx * dx + dy * dy);
    if (t < 0) {
        t = 0;
    } else if (t > 1) {
        t = 1;
    }

    return distanceBetweenPoints(point, {
        x: start.x + t * dx,
        y: start.y + t * dy,
    });
}

function distanceBetweenPoints(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function segmentsIntersect(a1, a2, b1, b2) {
    var epsilon = 0.01;

    if (
        distancePointToSegment(a1, b1, b2) <= epsilon ||
        distancePointToSegment(a2, b1, b2) <= epsilon ||
        distancePointToSegment(b1, a1, a2) <= epsilon ||
        distancePointToSegment(b2, a1, a2) <= epsilon
    ) {
        return false;
    }

    return (
        ccw(a1, b1, b2) !== ccw(a2, b1, b2) &&
        ccw(a1, a2, b1) !== ccw(a1, a2, b2)
    );
}

function ccw(a, b, c) {
    return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
}

/* ------------------------------------------------------------------ *
 * Color utilities (unchanged)
 * ------------------------------------------------------------------ */

function sortColorsByAestheticRainbow(colors) {
    var copy = colors.slice(0);
    copy.sort(function (a, b) {
        var colorA = getColorSortData(a);
        var colorB = getColorSortData(b);

        if (colorA.familyIndex !== colorB.familyIndex) {
            return colorA.familyIndex - colorB.familyIndex;
        }

        if (Math.abs(colorA.lightness - colorB.lightness) > 0.001) {
            return colorA.lightness - colorB.lightness;
        }

        if (Math.abs(colorB.saturation - colorA.saturation) > 0.001) {
            return colorB.saturation - colorA.saturation;
        }

        if (Math.abs(colorA.hue - colorB.hue) > 0.001) {
            return colorA.hue - colorB.hue;
        }

        if (a < b) {
            return -1;
        }
        if (a > b) {
            return 1;
        }
        return 0;
    });

    return copy;
}

function getColorSortData(hex) {
    var rgb = hexToRGBColor(hex);
    var hsl = rgbToHsl(rgb.red, rgb.green, rgb.blue);
    var hue = hsl.hue;
    var saturation = hsl.saturation;
    var lightness = hsl.lightness;
    var familyIndex = getHueFamilyIndex(hue, saturation);

    return {
        hue: hue,
        saturation: saturation,
        lightness: lightness,
        familyIndex: familyIndex,
    };
}

function getHueFamilyIndex(hue, saturation) {
    if (saturation < 0.12) {
        return 99;
    }

    if (hue >= 345 || hue < 20) {
        return 0; // red
    }
    if (hue < 45) {
        return 1; // orange
    }
    if (hue < 75) {
        return 2; // yellow
    }
    if (hue < 165) {
        return 3; // green and lime
    }
    if (hue < 210) {
        return 4; // cyan
    }
    if (hue < 255) {
        return 5; // blue
    }
    if (hue < 315) {
        return 6; // purple
    }

    return 7; // pink / magenta
}

function rgbToHsl(red, green, blue) {
    var r = red / 255;
    var g = green / 255;
    var b = blue / 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var h = 0;
    var s = 0;
    var l = (max + min) / 2;
    var delta = max - min;

    if (delta > 0) {
        s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

        if (max === r) {
            h = (g - b) / delta + (g < b ? 6 : 0);
        } else if (max === g) {
            h = (b - r) / delta + 2;
        } else {
            h = (r - g) / delta + 4;
        }

        h = h * 60;
    }

    return {
        hue: h,
        saturation: s,
        lightness: l,
    };
}

function sortNumbersDescending(numbers) {
    numbers.sort(function (a, b) {
        return b - a;
    });
    return numbers;
}

/* ------------------------------------------------------------------ *
 * Selection / document utilities (unchanged)
 * ------------------------------------------------------------------ */

function hasOpenDocument() {
    return app.documents.length > 0;
}

function hasSelection(doc) {
    return doc.selection && doc.selection.length > 0;
}

function collectPathItemsFromSelection(selection, output) {
    var selectionLength = selection.length;
    for (var i = 0; i < selectionLength; i++) {
        collectPathItems(selection[i], output);
    }
}

function collectPathItems(item, output) {
    if (!item) {
        return;
    }

    if (item.typename === "PathItem") {
        output.push(item);
        return;
    }

    if (item.typename === "GroupItem") {
        var pageItems = item.pageItems;
        var pageItemsLength = pageItems.length;
        for (var i = 0; i < pageItemsLength; i++) {
            collectPathItems(pageItems[i], output);
        }
        return;
    }

    if (item.typename === "CompoundPathItem") {
        var itemPathItems = item.pathItems;
        var itemPathItemsLength = itemPathItems.length;
        for (var j = 0; j < itemPathItemsLength; j++) {
            output.push(itemPathItems[j]);
        }
    }
}

function isRGBFill(pathItem) {
    return (
        pathItem.filled &&
        pathItem.fillColor &&
        pathItem.fillColor.typename === "RGBColor"
    );
}

function rgbColorToHex(color) {
    return "#" + toHex(color.red) + toHex(color.green) + toHex(color.blue);
}

function toHex(value) {
    var hex = Math.round(value).toString(16).toUpperCase();
    return hex.length === 1 ? "0" + hex : hex;
}

function hexToRGBColor(hex) {
    var clean = String(hex).replace("#", "");
    var rgb = new RGBColor();
    rgb.red = parseInt(clean.substring(0, 2), 16);
    rgb.green = parseInt(clean.substring(2, 4), 16);
    rgb.blue = parseInt(clean.substring(4, 6), 16);
    return rgb;
}

function makeRGBColor(r, g, b) {
    var color = new RGBColor();
    color.red = r;
    color.green = g;
    color.blue = b;
    return color;
}

function createRandomFn(seedValue) {
    if (seedValue === null || seedValue === undefined || seedValue === "") {
        return function () {
            return Math.random();
        };
    }

    var seed = parseInt(seedValue, 10);
    if (isNaN(seed)) {
        seed = 123456789;
    }

    var state = seed % 2147483648;
    if (state < 0) {
        state += 2147483648;
    }

    return function () {
        state = (1103515245 * state + 12345) % 2147483648;
        return state / 2147483648;
    };
}

function getOrCreateLayer(doc, name) {
    var previousActive = null;
    try {
        previousActive = doc.activeLayer;
    } catch (saveActiveError) {
        previousActive = null;
    }

    var layer = null;
    var docLayers = doc.layers;
    var docLayersLength = docLayers.length;
    for (var i = 0; i < docLayersLength; i++) {
        if (docLayers[i].name === name) {
            layer = docLayers[i];
            break;
        }
    }

    if (!layer) {
        layer = doc.layers.add();
        layer.name = name;
    }

    try {
        layer.locked = false;
    } catch (unlockError) {
        // Ignore.
    }
    try {
        layer.visible = true;
    } catch (unhideError) {
        // Ignore.
    }

    try {
        if (previousActive) {
            doc.activeLayer = previousActive;
        }
    } catch (restoreActiveError) {
        // Ignore.
    }

    return layer;
}

function findGroupByName(layer, groupName) {
    var groupItems = layer.groupItems;
    var groupItemsLength = groupItems.length;
    for (var i = 0; i < groupItemsLength; i++) {
        if (groupItems[i].name === groupName) {
            return groupItems[i];
        }
    }
    return null;
}

function groupLayerContents(layer, groupName) {
    if (!layer || !CONFIG.groupGeneratedItems) {
        return null;
    }

    var group = findGroupByName(layer, groupName);
    var createdGroup = false;
    if (!group) {
        group = layer.groupItems.add();
        group.name = groupName;
        createdGroup = true;
    }

    var items = [];
    var pageItems = layer.pageItems;
    var pageItemsLength = pageItems.length;
    for (var i = 0; i < pageItemsLength; i++) {
        var item = pageItems[i];
        if (item.parent === layer && item !== group) {
            items.push(item);
        }
    }

    if (items.length === 0) {
        if (createdGroup) {
            try {
                group.remove();
            } catch (removeEmptyGroupError) {
                // Ignore.
            }
        }
        return null;
    }

    for (var j = 0; j < items.length; j++) {
        try {
            items[j].move(group, ElementPlacement.PLACEATEND);
        } catch (moveIntoGroupError) {
            // Ignore.
        }
    }

    ensureItemOnLayer(group, layer);

    return group;
}

function pushUnique(arr, value) {
    for (var i = 0; i < arr.length; i++) {
        if (arr[i] === value) {
            return;
        }
    }
    arr.push(value);
}

function isHexExcluded(excludedColors, hex) {
    if (!excludedColors) {
        return false;
    }
    for (var i = 0; i < excludedColors.length; i++) {
        if (excludedColors[i] === hex) {
            return true;
        }
    }
    return false;
}

function shallowCopy(obj) {
    var copy = {};
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            copy[key] = obj[key];
        }
    }
    return copy;
}

function mergeObjects(base, extra) {
    var merged = shallowCopy(base);
    for (var key in extra) {
        if (extra.hasOwnProperty(key)) {
            merged[key] = extra[key];
        }
    }
    return merged;
}

function isInteger(value) {
    return (
        typeof value === "number" &&
        isFinite(value) &&
        Math.floor(value) === value
    );
}

/* ------------------------------------------------------------------ *
 * Summary
 * ------------------------------------------------------------------ */

function describeModeForSummary(s) {
    if (s.mode === "fixed") {
        return "Fixed table (" + s.fixedOperation + ")";
    }
    if (s.mode === "random") {
        return "Random (" + s.randomOperation + ")";
    }
    if (s.mode === "fraction") {
        return (
            "Fractions (" +
            s.fractionOperation +
            ", " +
            (s.fractionAnswerType === "integer" ? "integer" : "fraction") +
            " answers)"
        );
    }
    return String(s.mode);
}

function normalizeErrorMessage(rawError) {
    var text = String(rawError);
    var match = text.match(/^PathItem \d+:\s*/);
    if (match) {
        return text.substring(match[0].length);
    }
    return text;
}

function groupErrorMessages(errors) {
    var counts = {};
    var order = [];
    for (var i = 0; i < errors.length; i++) {
        var message = normalizeErrorMessage(errors[i]);
        if (!counts.hasOwnProperty(message)) {
            counts[message] = 0;
            order.push(message);
        }
        counts[message]++;
    }

    var grouped = [];
    for (var j = 0; j < order.length; j++) {
        grouped.push({ message: order[j], count: counts[order[j]] });
    }
    return grouped;
}

function showSummary(stats, dialogResult) {
    var lines = [];
    lines.push("Mode: " + describeModeForSummary(dialogResult));
    lines.push("Unique colors found: " + stats.uniqueColors);
    lines.push("PathItems found: " + stats.totalPathItems);
    lines.push("Shapes processed: " + stats.processed);
    lines.push("Skipped (hidden/locked): " + stats.skippedHiddenOrLocked);
    lines.push("Skipped (non-RGB fill): " + stats.skippedNonRGB);
    lines.push("Skipped (no mapping): " + stats.skippedNoMapping);
    if (stats.skippedExcluded > 0) {
        lines.push("Skipped (color excluded): " + stats.skippedExcluded);
    }
    lines.push("Skipped (no valid expression): " + stats.skippedNoExpression);

    if (stats.preprintShapes > 0) {
        lines.push("Preprint shapes (too small for text): " + stats.preprintShapes);
    }
    if (stats.excludedPreprintShapes > 0) {
        lines.push("Preprint shapes (excluded colors): " + stats.excludedPreprintShapes);
    }

    if (stats.unmappedHex.length > 0) {
        lines.push("Unmapped colors: " + stats.unmappedHex.join(", "));
    }

    if (stats.errors.length > 0) {
        var grouped = groupErrorMessages(stats.errors);
        var maxShown = 5;
        lines.push("Errors:");
        for (var gi = 0; gi < grouped.length && gi < maxShown; gi++) {
            lines.push(grouped[gi].message + " (" + grouped[gi].count + " times)");
        }
        if (grouped.length > maxShown) {
            lines.push(
                "... and " + (grouped.length - maxShown) + " more distinct error(s).",
            );
        }
    }

    if (stats.livePaint && !stats.livePaint.cancelled && stats.livePaint.expanded > 0) {
        lines.push("Live Paint groups expanded: " + stats.livePaint.expanded);
        lines.push(
            "Stroke group removed: " +
                (stats.livePaint.strokeGroupRemoved ? "yes" : "no"),
        );
    }

    alert(lines.join("\n"));
}
