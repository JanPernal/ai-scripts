/*
MathColoringBookGenerator.jsx

Universal color-by-math generator for Adobe Illustrator.

Usage:
1) Set CONFIG.presetName.
2) For fixed-table pages, change CONFIG.fixedFactor or CONFIG.fixedDivisor.
3) For random pages, change CONFIG.customAnswers if needed.
4) Select colored objects (PathItem / groups containing PathItem).
5) Run this script.
*/

var CONFIG = {
    // Choose one of the generic presets from PRESETS.
    presetName: "fixedMultiplication",

    // Used by fixedMultiplication.
    fixedFactor: 5,

    // Used by fixedDivision.
    fixedDivisor: 10,

    // Used by randomMultiplication, randomDivision and mixedRandom.
    customAnswers: [20, 28, 45, 50, 60, 63, 70, 72, 80, 90],

    // Colors from the page are grouped in an aesthetic rainbow order and then
    // automatically matched to answers sorted from largest to smallest.
    requireExactColorCount: true,

    // If true, text can rotate to follow the best-fitting inner box.
    rotateTextWithShape: true,

    // Automatic text color (black/white) based on fill brightness.
    autoTextContrast: true,
    darkLumaThreshold: 130,

    // Fallback text size when preset does not provide one.
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
    },
};

var PRESETS = {
    fixedMultiplication: {
        mode: "multiplication",
        answerSource: "fixedMultiplication",
        textSize: 10,
        multiplication: {
            minFactor: 1,
            maxFactor: 10,
            fixedFactor: null,
            randomizeOrder: false,
            preferFixedFactorFirst: true,
        },
    },

    fixedDivision: {
        mode: "division",
        answerSource: "fixedDivision",
        textSize: 10,
        division: {
            minDivisor: 2,
            maxDivisor: 10,
            fixedDivisor: null,
            maxDividend: null,
        },
    },

    randomMultiplication: {
        mode: "multiplication",
        answerSource: "custom",
        textSize: 10,
        multiplication: {
            minFactor: 2,
            maxFactor: 20,
            fixedFactor: null,
            randomizeOrder: true,
            preferFixedFactorFirst: false,
        },
    },

    randomDivision: {
        mode: "division",
        answerSource: "custom",
        textSize: 10,
        division: {
            minDivisor: 2,
            maxDivisor: 10,
            fixedDivisor: null,
            maxDividend: null,
        },
    },

    mixedRandom: {
        mode: "mixed",
        answerSource: "custom",
        textSize: 10,
        multiplication: {
            minFactor: 2,
            maxFactor: 20,
            fixedFactor: null,
            randomizeOrder: true,
            preferFixedFactorFirst: false,
        },
        division: {
            minDivisor: 2,
            maxDivisor: 10,
            fixedDivisor: null,
            maxDividend: null,
        },
    },
};

main();

function main() {
    if (!hasOpenDocument()) {
        alert("Brak otwartych dokumentow.");
        return;
    }

    var doc = app.activeDocument;
    if (!hasSelection(doc)) {
        alert("Najpierw zaznacz obiekty.");
        return;
    }

    var preset = PRESETS[CONFIG.presetName];
    if (!preset) {
        alert("Nieznany preset: " + CONFIG.presetName);
        return;
    }

    var runtimePreset = buildRuntimePreset(preset);
    if (runtimePreset.error) {
        alert(runtimePreset.error);
        return;
    }

    var pathItems = [];
    collectPathItemsFromSelection(doc.selection, pathItems);
    if (pathItems.length === 0) {
        alert("Brak PathItem w zaznaczeniu.");
        return;
    }

    var colorAssignment = buildAutomaticColorAssignment(
        pathItems,
        runtimePreset.answers,
    );
    if (colorAssignment.error) {
        alert(colorAssignment.error);
        return;
    }

    runtimePreset.colorToAnswer = colorAssignment.colorToAnswer;

    var randomFn = createRandomFn(CONFIG.randomSeed);
    var result = processPathItems(doc, pathItems, runtimePreset, randomFn);
    result.autoAssignments = colorAssignment.assignments.length;

    if (CONFIG.legend.enabled) {
        createLegend(doc, colorAssignment.assignments);
    }

    showSummary(result);
}

function processPathItems(doc, pathItems, preset, randomFn) {
    var stats = {
        totalPathItems: pathItems.length,
        processed: 0,
        skippedHiddenOrLocked: 0,
        skippedNonRGB: 0,
        skippedNoMapping: 0,
        skippedNoExpression: 0,
        errors: [],
        unmappedHex: [],
        usedEntries: {},
    };

    var answerKeyLayer = null;
    if (CONFIG.answerKey.enabled) {
        answerKeyLayer = getOrCreateLayer(doc, CONFIG.answerKey.layerName);
        answerKeyLayer.visible = !CONFIG.answerKey.hidden;
    }

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
        var answer = preset.colorToAnswer[hexColor];

        if (answer === undefined || answer === null) {
            stats.skippedNoMapping++;
            pushUnique(stats.unmappedHex, hexColor);
            continue;
        }

        var expression = buildExpression(answer, preset, randomFn);
        if (!expression) {
            stats.skippedNoExpression++;
            continue;
        }

        try {
            createFittedTextFrame(
                doc,
                pathItem,
                expression,
                preset.textSize || CONFIG.defaultTextSize,
                pathItem.fillColor,
            );

            stats.processed++;
            stats.usedEntries[String(answer)] = {
                answer: answer,
                hex: hexColor,
            };

            if (answerKeyLayer) {
                addAnswerKeyItem(answerKeyLayer, pathItem, expression, answer);
            }
        } catch (e) {
            stats.errors.push("PathItem " + (i + 1) + ": " + e);
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
        return b.answer - a.answer;
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

        var label = group.textFrames.pointText([0, 0]);
        label.contents = String(entry.answer);
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

        col++;
        if (col >= CONFIG.legend.maxColumns) {
            col = 0;
            row++;
        }
    }
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

function addAnswerKeyItem(layer, pathItem, expression, answer) {
    var bounds = pathItem.geometricBounds; // [left, top, right, bottom]
    var centerX = (bounds[0] + bounds[2]) / 2;
    var centerY = (bounds[1] + bounds[3]) / 2;

    var text = layer.textFrames.pointText([centerX, centerY]);
    text.contents = expression + " = " + answer;
    text.textRange.size = CONFIG.answerKey.textSize;
    text.textRange.fillColor = makeRGBColor(180, 20, 20);
}

function buildExpression(answer, preset, randomFn) {
    if (preset.mode === "multiplication") {
        return buildMultiplicationExpression(
            answer,
            preset.multiplication,
            randomFn,
        );
    }

    if (preset.mode === "division") {
        return buildDivisionExpression(answer, preset.division, randomFn);
    }

    if (preset.mode === "mixed") {
        var options = [];
        var mul = buildMultiplicationExpression(
            answer,
            preset.multiplication,
            randomFn,
        );
        var div = buildDivisionExpression(answer, preset.division, randomFn);

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

function createFittedTextFrame(doc, pathItem, expression, baseSize, fillColor) {
    var polygon = getPolygonAnchors(pathItem);
    var layoutOptions = getTextLayoutCandidates(pathItem, polygon);
    var layoutBox = chooseBestTextLayout(
        doc,
        layoutOptions,
        polygon,
        expression,
        baseSize,
    );
    var textFrame = doc.textFrames.pointText([0, 0]);
    textFrame.contents = expression;

    formatTextFrame(textFrame, layoutBox.fittedSize, fillColor);

    centerPointTextInBox(textFrame, layoutBox);

    if (CONFIG.rotateTextWithShape && Math.abs(layoutBox.angle) > 0.01) {
        textFrame.rotate(layoutBox.angle);
        centerPointTextInBox(textFrame, layoutBox);
    }

    return textFrame;
}

function chooseBestTextLayout(
    doc,
    layoutOptions,
    polygon,
    expression,
    baseSize,
) {
    var preferredHorizontal = findPreferredHorizontalLayout(
        doc,
        layoutOptions,
        polygon,
        expression,
        baseSize,
    );
    if (preferredHorizontal) {
        return preferredHorizontal;
    }

    var best = null;

    for (var i = 0; i < layoutOptions.length; i++) {
        var trialTextFrame = doc.textFrames.pointText([0, 0]);
        trialTextFrame.contents = expression;

        var fittedSize = fitPointTextSize(
            trialTextFrame,
            layoutOptions[i],
            baseSize,
            polygon,
        );

        var candidate = shallowCopy(layoutOptions[i]);
        candidate.fittedSize = fittedSize;
        candidate.fits = doesTextFitLayout(
            trialTextFrame,
            layoutOptions[i],
            polygon,
        );

        if (!best || isBetterLayoutCandidate(candidate, best)) {
            best = candidate;
        }

        trialTextFrame.remove();
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
    layoutOptions,
    polygon,
    expression,
    baseSize,
) {
    var best = null;

    for (var i = 0; i < layoutOptions.length; i++) {
        if (!isHorizontalLayout(layoutOptions[i])) {
            continue;
        }

        var trialTextFrame = doc.textFrames.pointText([0, 0]);
        trialTextFrame.contents = expression;
        setTextFrameSize(trialTextFrame, baseSize);

        if (doesTextFitLayout(trialTextFrame, layoutOptions[i], polygon)) {
            var candidate = shallowCopy(layoutOptions[i]);
            candidate.fittedSize = baseSize;
            candidate.fits = true;

            if (!best || candidate.area > best.area) {
                best = candidate;
            }
        }

        trialTextFrame.remove();
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

    if (!pathItem.closed || pathItem.pathPoints.length < 3) {
        return anchors;
    }

    for (var i = 0; i < pathItem.pathPoints.length; i++) {
        var anchor = pathItem.pathPoints[i].anchor;
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

    var best = null;

    for (var start = 0; start < sampleYs.length - 1; start++) {
        var overlapIntervals = getHorizontalIntervals(points, sampleYs[start]);
        if (overlapIntervals.length === 0) {
            continue;
        }

        for (var end = start + 1; end < sampleYs.length; end++) {
            var y = sampleYs[end];
            var intervals = getHorizontalIntervals(points, y);
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

function buildRuntimePreset(preset) {
    var result = shallowCopy(preset);

    result.multiplication = mergeObjects(
        {
            minFactor: 1,
            maxFactor: 10,
            fixedFactor: null,
            randomizeOrder: true,
            preferFixedFactorFirst: false,
        },
        preset.multiplication || {},
    );

    result.division = mergeObjects(
        {
            minDivisor: 2,
            maxDivisor: 10,
            fixedDivisor: null,
            maxDividend: 144,
        },
        preset.division || {},
    );

    if (result.answerSource === "fixedMultiplication") {
        result.multiplication.fixedFactor = requirePositiveInteger(
            CONFIG.fixedFactor,
            "CONFIG.fixedFactor",
        );
        if (!result.multiplication.fixedFactor) {
            return {
                error: "CONFIG.fixedFactor musi byc dodatnia liczba calkowita.",
            };
        }
        result.answers = buildFixedMultiplicationAnswers(
            result.multiplication.fixedFactor,
        );
        return result;
    }

    if (result.answerSource === "fixedDivision") {
        result.division.fixedDivisor = requirePositiveInteger(
            CONFIG.fixedDivisor,
            "CONFIG.fixedDivisor",
        );
        if (!result.division.fixedDivisor || result.division.fixedDivisor < 2) {
            return {
                error: "CONFIG.fixedDivisor musi byc liczba calkowita od 2 wzwyz.",
            };
        }
        result.division.maxDividend = result.division.fixedDivisor * 10;
        result.answers = buildFixedDivisionAnswers();
        return result;
    }

    if (result.answerSource === "custom") {
        result.answers = buildCustomAnswers(CONFIG.customAnswers);
        if (!result.answers || result.answers.length === 0) {
            return {
                error: "CONFIG.customAnswers musi zawierac co najmniej jedna dodatnia liczbe calkowita.",
            };
        }
        return result;
    }

    return { error: "Preset nie ma poprawnego answerSource." };
}

function buildFixedMultiplicationAnswers(fixedFactor) {
    var answers = [];
    for (var i = 1; i <= 10; i++) {
        answers.push(fixedFactor * i);
    }
    return sortNumbersDescending(answers);
}

function buildFixedDivisionAnswers() {
    var answers = [];
    for (var i = 1; i <= 10; i++) {
        answers.push(i);
    }
    return sortNumbersDescending(answers);
}

function buildCustomAnswers(source) {
    if (!source || source.length === undefined) {
        return [];
    }

    var answers = [];
    var seen = {};

    for (var i = 0; i < source.length; i++) {
        var value = requirePositiveInteger(
            source[i],
            "CONFIG.customAnswers[" + i + "]",
        );
        if (!value) {
            continue;
        }

        if (seen[value]) {
            continue;
        }

        seen[value] = true;
        answers.push(value);
    }

    return sortNumbersDescending(answers);
}

function buildAutomaticColorAssignment(pathItems, answers) {
    var uniqueColors = collectEligibleUniqueFillHexColors(pathItems);
    if (uniqueColors.length === 0) {
        return { error: "Brak obiektow z wypelnieniem RGB w zaznaczeniu." };
    }

    var sortedColors = sortColorsByAestheticRainbow(uniqueColors);
    var sortedAnswers = sortNumbersDescending(answers.slice(0));

    if (
        CONFIG.requireExactColorCount &&
        sortedColors.length !== sortedAnswers.length
    ) {
        return {
            error:
                "Liczba unikalnych kolorow (" +
                sortedColors.length +
                ") nie zgadza sie z liczba odpowiedzi (" +
                sortedAnswers.length +
                ")." +
                "\nKolory strony sa mapowane automatycznie, wiec liczby musza sie zgadzac.",
        };
    }

    var count = Math.min(sortedColors.length, sortedAnswers.length);
    var colorToAnswer = {};
    var assignments = [];

    for (var i = 0; i < count; i++) {
        colorToAnswer[sortedColors[i]] = sortedAnswers[i];
        assignments.push({
            hex: sortedColors[i],
            answer: sortedAnswers[i],
        });
    }

    return {
        colorToAnswer: colorToAnswer,
        assignments: assignments,
    };
}

function collectEligibleUniqueFillHexColors(pathItems) {
    var unique = [];

    for (var i = 0; i < pathItems.length; i++) {
        var pathItem = pathItems[i];

        if (pathItem.hidden || pathItem.locked) {
            continue;
        }

        if (!isRGBFill(pathItem)) {
            continue;
        }

        pushUnique(unique, rgbColorToHex(pathItem.fillColor).toUpperCase());
    }

    return unique;
}

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

function requirePositiveInteger(value, label) {
    var parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed <= 0) {
        return null;
    }
    return parsed;
}

function normalizeColorMap(colorMap) {
    var normalized = {};
    for (var hex in colorMap) {
        if (colorMap.hasOwnProperty(hex)) {
            normalized[String(hex).toUpperCase()] = colorMap[hex];
        }
    }
    return normalized;
}

function hasOpenDocument() {
    return app.documents.length > 0;
}

function hasSelection(doc) {
    return doc.selection && doc.selection.length > 0;
}

function collectPathItemsFromSelection(selection, output) {
    for (var i = 0; i < selection.length; i++) {
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
        for (var i = 0; i < item.pageItems.length; i++) {
            collectPathItems(item.pageItems[i], output);
        }
        return;
    }

    if (item.typename === "CompoundPathItem") {
        for (var j = 0; j < item.pathItems.length; j++) {
            output.push(item.pathItems[j]);
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
    for (var i = 0; i < doc.layers.length; i++) {
        if (doc.layers[i].name === name) {
            return doc.layers[i];
        }
    }

    var layer = doc.layers.add();
    layer.name = name;
    return layer;
}

function findGroupByName(layer, groupName) {
    for (var i = 0; i < layer.groupItems.length; i++) {
        if (layer.groupItems[i].name === groupName) {
            return layer.groupItems[i];
        }
    }
    return null;
}

function pushUnique(arr, value) {
    for (var i = 0; i < arr.length; i++) {
        if (arr[i] === value) {
            return;
        }
    }
    arr.push(value);
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

function showSummary(stats) {
    var lines = [];
    lines.push("Preset: " + CONFIG.presetName);
    lines.push("PathItems znalezione: " + stats.totalPathItems);
    if (stats.autoAssignments !== undefined) {
        lines.push("Automatyczne mapowania kolorow: " + stats.autoAssignments);
    }
    lines.push("Przetworzone: " + stats.processed);
    lines.push(
        "Pominiete (ukryte/zablokowane): " + stats.skippedHiddenOrLocked,
    );
    lines.push("Pominiete (bez RGB fill): " + stats.skippedNonRGB);
    lines.push("Pominiete (brak mapowania): " + stats.skippedNoMapping);
    lines.push(
        "Pominiete (brak poprawnego dzialania): " + stats.skippedNoExpression,
    );

    if (stats.unmappedHex.length > 0) {
        lines.push("Kolory bez mapowania: " + stats.unmappedHex.join(", "));
    }

    if (stats.errors.length > 0) {
        lines.push("Bledy: " + stats.errors.slice(0, 3).join(" | "));
        if (stats.errors.length > 3) {
            lines.push(
                "... i jeszcze " + (stats.errors.length - 3) + " bledow.",
            );
        }
    }

    alert(lines.join("\n"));
}
