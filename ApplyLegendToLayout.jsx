// ApplyLegendToLayout.jsx
// Copies the color key (colors + answers) from the "Math Legend" layer into
// the page layout on the "layout" layer, one artboard at a time.
// Per artboard: ungroup page -> rebuild bottom + top swatches (sorted by answer,
// equal gaps, same corner radius) -> Live Paint -> answers under swatches
// (fractions copied from the legend as real stacked fractions) -> header -> regroup.
// Only the "layout" layer is modified. Other layers are read-only.
#target illustrator
(function () {
    var CFG = {
        legendLayer: "Math Legend",
        layoutLayer: "layout",
        opsLayer: "Math Operations",
        // bottom swatch row (offsets measured from artboard bottom, pt)
        bottomTopOffset: 81,     // swatch top = artboardBottom + 81
        bottomHeight: 36.9,
        bottomGap: 18,
        bottomRadius: 8.64,
        // answers row
        numTopOffset: 36,        // text frame top = artboardBottom + 36
        numHeight: 36,
        numSize: 32,
        numFont: "MyriadPro-Regular",
        fractionHeight: 40,      // total height of a stacked fraction
        // top mini swatches
        topSize: 18,
        topStep: 27,
        topRadius: 4.32,
        headerZone: 30,          // items within 30pt from artboard top = header area
        bottomZone: 90           // items within 90pt from artboard bottom = swatch/answer area
    };

    if (app.documents.length === 0) { alert("No document open."); return; }
    var doc = app.activeDocument;
    var legendL, layoutL, opsL;
    try { legendL = doc.layers.getByName(CFG.legendLayer); layoutL = doc.layers.getByName(CFG.layoutLayer); }
    catch (e) { alert("Missing layer '" + CFG.legendLayer + "' or '" + CFG.layoutLayer + "'."); return; }
    try { opsL = doc.layers.getByName(CFG.opsLayer); } catch (e2) { opsL = null; }

    var input = prompt("Artboards to process (e.g. 1  or  2-5  or  1,3,7  or  all):", "1");
    if (input === null) return;
    var targets = parseRange(input, doc.artboards.length);
    if (!targets.length) { alert("Nothing to process."); return; }

    var wasLocked = layoutL.locked, wasVisible = layoutL.visible;
    layoutL.locked = false; layoutL.visible = true;

    var report = [];
    for (var t = 0; t < targets.length; t++) {
        try { report.push(processArtboard(targets[t])); }
        catch (err) { report.push("AB" + (targets[t] + 1) + ": ERROR " + err + (err.line ? " (line " + err.line + ")" : "")); }
    }
    doc.selection = null;
    layoutL.locked = wasLocked; layoutL.visible = wasVisible;
    alert("Done:\n" + report.join("\n"));

    // ------------------------------------------------------------------
    function processArtboard(ai) {
        var rect = doc.artboards[ai].artboardRect; // [L, T, R, B]
        var L = rect[0], T = rect[1], R = rect[2], B = rect[3], W = R - L;

        // 1. legend entries for this artboard
        var entries = readLegend(rect);
        if (!entries.length) return "AB" + (ai + 1) + ": no legend found, skipped";
        entries.sort(function (a, b) { return a.value - b.value; });
        var N = entries.length;

        // 2. collect + ungroup page items on layout layer
        var items = itemsInRect(layoutL, rect);
        var flat = [];
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it.typename === "GroupItem" && isPageGroup(it, rect)) {
                var kids = [];
                for (var k = 0; k < it.pageItems.length; k++) kids.push(it.pageItems[k]);
                for (k = kids.length - 1; k >= 0; k--) { kids[k].move(it, ElementPlacement.PLACEBEFORE); flat.push(kids[k]); }
                it.remove();
            } else flat.push(it);
        }

        // 3. classify
        var header = null, toRemove = [], kept = 0;
        for (i = 0; i < flat.length; i++) {
            var f = flat[i], b = f.geometricBounds, cy = (b[1] + b[3]) / 2;
            var nearTop = cy > T - CFG.headerZone, nearBottom = cy < B + CFG.bottomZone;
            if (f.typename === "TextFrame" && nearTop && !header) header = f;
            else if (f.typename === "PluginItem") toRemove.push(f);
            else if (f.typename === "PathItem" && (nearTop || nearBottom)) toRemove.push(f);
            else if ((f.typename === "TextFrame" || f.typename === "GroupItem" || f.typename === "CompoundPathItem") && nearBottom) toRemove.push(f);
            else kept++;
        }
        var numFont = pickFont(flat);
        for (i = 0; i < toRemove.length; i++) toRemove[i].remove();

        // 4. bottom swatches
        var newItems = [], swatches = [];
        var w = (W - CFG.bottomGap * (N - 1)) / N;
        var sTop = B + CFG.bottomTopOffset;
        for (i = 0; i < N; i++) {
            var x = L + i * (w + CFG.bottomGap);
            swatches.push(makeSwatch(sTop, x, w, CFG.bottomHeight, CFG.bottomRadius, entries[i].color));
        }
        // 5. top mini swatches: left block from left edge, right block from right edge
        var nLeft = Math.ceil(N / 2), nRight = N - nLeft;
        for (i = 0; i < nLeft; i++)
            swatches.push(makeSwatch(T, L + i * CFG.topStep, CFG.topSize, CFG.topSize, CFG.topRadius, entries[i].color));
        for (i = 0; i < nRight; i++) {
            var xr = R - CFG.topSize - (nRight - 1 - i) * CFG.topStep;
            swatches.push(makeSwatch(T, xr, CFG.topSize, CFG.topSize, CFG.topRadius, entries[nLeft + i].color));
        }

        // 6. Live Paint
        doc.selection = null;
        for (i = 0; i < swatches.length; i++) swatches[i].selected = true;
        app.executeMenuCommand("Make Planet X");
        var lp = doc.selection.length ? doc.selection[0] : null;
        doc.selection = null;
        if (lp && lp.layer !== layoutL) lp.move(layoutL, ElementPlacement.PLACEATBEGINNING);

        // 7. answers
        var numTop = B + CFG.numTopOffset;
        for (i = 0; i < N; i++) {
            var cx = L + i * (w + CFG.bottomGap) + w / 2;
            var e = entries[i];
            if (e.labelType === "fraction") newItems.push(placeFraction(e.label, cx, numTop - CFG.numHeight / 2));
            else newItems.push(placeNumber(e.text, L + i * (w + CFG.bottomGap), numTop, w, numFont));
        }

        // 8. header
        var htxt = buildHeader(rect);
        if (header && htxt) { header.contents = htxt; fitOneLine(header); }

        // 9. regroup page (layout layer only)
        var g = layoutL.groupItems.add();
        if (header) header.move(g, ElementPlacement.PLACEATEND);
        if (lp) lp.move(g, ElementPlacement.PLACEATEND);
        for (i = 0; i < newItems.length; i++) newItems[i].move(g, ElementPlacement.PLACEATEND);

        return "AB" + (ai + 1) + ": " + N + " colors [" + list(entries) + "]  header: " + (header ? header.contents : "(none)") +
            (kept ? "  (" + kept + " unrecognized item(s) left ungrouped)" : "") + (lp ? "" : "  WARNING: Live Paint not created");
    }

    // ------------------------------------------------------------------
    function readLegend(rect) {
        var res = [];
        for (var i = 0; i < legendL.pageItems.length; i++) {
            var g = legendL.pageItems[i];
            if (!centerIn(g, rect) || g.typename !== "GroupItem") continue;
            var squares = [], labels = [];
            for (var k = 0; k < g.pageItems.length; k++) {
                var p = g.pageItems[k];
                if (p.typename === "PathItem" && p.filled && p.width > 15 && Math.abs(p.width - p.height) < 2) squares.push(p);
                else if (p.typename === "TextFrame" && /^\s*\d+\s*$/.test(p.contents)) labels.push(p);
                else if (p.typename === "GroupItem") labels.push(p);
            }
            for (k = 0; k < squares.length; k++) {
                var sq = squares[k], lab = null;
                for (var j = 0; j < labels.length; j++) if (centerIn(labels[j], sq.geometricBounds)) { lab = labels[j]; break; }
                if (!lab) continue;
                var e = { color: sq.fillColor, label: lab };
                if (lab.typename === "TextFrame") { e.labelType = "int"; e.text = trim(lab.contents); e.value = parseFloat(e.text); }
                else {
                    var fr = readFraction(lab);
                    if (!fr) continue;
                    e.labelType = "fraction"; e.text = fr.n + "/" + fr.d; e.value = fr.n / fr.d;
                }
                res.push(e);
            }
        }
        return res;
    }
    function readFraction(grp) {
        var tfs = [];
        collect(grp, function (x) { if (x.typename === "TextFrame") tfs.push(x); });
        if (tfs.length !== 2) return null;
        tfs.sort(function (a, b) { return b.geometricBounds[1] - a.geometricBounds[1]; });
        return { n: parseFloat(tfs[0].contents), d: parseFloat(tfs[1].contents) };
    }

    function makeSwatch(top, left, w, h, r, color) {
        var p = layoutL.pathItems.roundedRectangle(top, left, w, h, r, r);
        p.filled = true; p.fillColor = color; p.stroked = false;
        return p;
    }

    function placeNumber(txt, left, top, w, font) {
        var box = layoutL.pathItems.rectangle(top, left, w, CFG.numHeight);
        var tf = layoutL.textFrames.areaText(box);
        tf.contents = txt;
        var ca = tf.textRange.characterAttributes;
        if (font) ca.textFont = font;
        ca.size = CFG.numSize; ca.fillColor = black();
        tf.textRange.paragraphAttributes.justification = Justification.CENTER;
        tf.name = "CK_answer";
        return tf;
    }

    function placeFraction(src, cx, cy) {
        var d = src.duplicate(layoutL, ElementPlacement.PLACEATBEGINNING);
        collect(d, function (x) {
            if (x.typename === "TextFrame") x.textRange.characterAttributes.fillColor = black();
            else if (x.typename === "PathItem" && x.filled) x.fillColor = black();
        });
        var s = CFG.fractionHeight / d.height * 100;
        d.resize(s, s, true, true, true, true, s, Transformation.CENTER);
        var b = d.geometricBounds;
        d.translate(cx - (b[0] + b[2]) / 2, cy - (b[1] + b[3]) / 2);
        d.name = "CK_answer";
        return d;
    }

    function buildHeader(rect) {
        if (!opsL) return null;
        var texts = [], hasFrac = false;
        for (var i = 0; i < opsL.pageItems.length; i++) {
            var g = opsL.pageItems[i];
            if (!centerIn(g, rect)) continue;
            collect(g, function (x) {
                if (x.typename === "TextFrame") texts.push(String(x.contents));
                if (x.typename === "GroupItem" && x.pathItems.length >= 1 && x.textFrames.length >= 2) hasFrac = true;
            });
        }
        if (!texts.length) return null;
        var all = texts.join(" ");
        var add = /\+/.test(all), sub = /[−\-–]/.test(all), mul = /[x×*]/.test(all), div = /[÷:]/.test(all);
        if (hasFrac) {
            var ops = [];
            if (add) ops.push("addition"); if (sub) ops.push("subtraction");
            if (mul) ops.push("multiplication"); if (div) ops.push("division");
            return "Color by fractions" + (ops.length ? ": " + ops.join(" & ") : "");
        }
        var exprs = [];
        for (i = 0; i < texts.length; i++) {
            var m = texts[i].match(/^\s*(\d+)\s*([x×*÷:])\s*(\d+)\s*$/);
            if (m) exprs.push([parseInt(m[1], 10), m[2], parseInt(m[3], 10)]);
        }
        if (!exprs.length) return null;
        var isDiv = /[÷:]/.test(exprs[0][1]);
        var common = null;
        if (isDiv) {
            common = exprs[0][2];
            for (i = 1; i < exprs.length; i++) if (exprs[i][2] !== common) { common = null; break; }
            return "Color by division" + (common !== null ? ": " + common : "");
        }
        var cands = [exprs[0][0], exprs[0][2]];
        for (var c = 0; c < cands.length; c++) {
            var ok = true;
            for (i = 1; i < exprs.length; i++) if (exprs[i][0] !== cands[c] && exprs[i][2] !== cands[c]) { ok = false; break; }
            if (ok) { common = cands[c]; break; }
        }
        return "Color by multiplication" + (common !== null ? ": " + common : "");
    }

    function fitOneLine(tf) {
        var size = tf.textRange.characterAttributes.size, len = tf.contents.length;
        for (var guard = 0; guard < 40; guard++) {
            var vis = 0;
            try { for (var l = 0; l < tf.lines.length; l++) vis += tf.lines[l].characters.length; } catch (e) { }
            if (tf.lines.length <= 1 && vis >= len) return;
            size -= 0.5; if (size < 8) return;
            tf.textRange.characterAttributes.size = size;
        }
    }

    // ------------------------------------------------------------------ helpers
    function isPageGroup(g, rect) { return g.width > (rect[2] - rect[0]) * 0.8 && g.height > (rect[1] - rect[3]) * 0.5; }
    function itemsInRect(layer, rect) { var r = []; for (var i = 0; i < layer.pageItems.length; i++) if (centerIn(layer.pageItems[i], rect)) r.push(layer.pageItems[i]); return r; }
    function centerIn(it, r) { var b = it.geometricBounds, cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; return cx > r[0] && cx < r[2] && cy < r[1] && cy > r[3]; }
    function collect(it, fn) {
        fn(it);
        var ch = null;
        if (it.typename === "GroupItem") ch = it.pageItems; else if (it.typename === "CompoundPathItem") ch = it.pathItems;
        if (ch) for (var i = 0; i < ch.length; i++) collect(ch[i], fn);
    }
    function pickFont(items) {
        for (var i = 0; i < items.length; i++) if (items[i].typename === "TextFrame" && items[i].textRange.characterAttributes.size > 25)
            return items[i].textRange.characterAttributes.textFont;
        try { return app.textFonts.getByName(CFG.numFont); } catch (e) { return null; }
    }
    function black() { var c = new RGBColor(); c.red = 0; c.green = 0; c.blue = 0; return c; }
    function trim(s) { return String(s).replace(/^\s+|\s+$/g, ""); }
    function list(es) { var a = []; for (var i = 0; i < es.length; i++) a.push(es[i].text); return a.join(", "); }
    function parseRange(s, max) {
        s = trim(s).toLowerCase(); var out = [];
        if (s === "all") { for (var i = 0; i < max; i++) out.push(i); return out; }
        var parts = s.split(",");
        for (var p = 0; p < parts.length; p++) {
            var m = trim(parts[p]).match(/^(\d+)\s*-\s*(\d+)$/);
            if (m) { for (var j = +m[1]; j <= +m[2]; j++) if (j >= 1 && j <= max) out.push(j - 1); }
            else if (/^\d+$/.test(trim(parts[p]))) { var n = +trim(parts[p]); if (n >= 1 && n <= max) out.push(n - 1); }
        }
        return out;
    }
})();
