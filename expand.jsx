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

function pushUnique(list, item) {
    for (var i = 0; i < list.length; i++) {
        if (list[i] === item) {
            return;
        }
    }
    list.push(item);
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
        for (var i = 0; i < item.pageItems.length; i++) {
            collectLivePaintGroups(item.pageItems[i], list);
        }
    }
}

function main() {
    if (app.documents.length === 0) {
        alert("Brak otwartego dokumentu.");
        return;
    }

    var doc = app.activeDocument;
    var selection = doc.selection;

    if (!selection || selection.length === 0) {
        alert("Zaznacz grupe Live Paint!");
        return;
    }

    var livePaintGroups = [];
    for (var i = 0; i < selection.length; i++) {
        collectLivePaintGroups(selection[i], livePaintGroups);
    }

    if (livePaintGroups.length === 0) {
        alert("Brak grup Live Paint w zaznaczeniu.");
        return;
    }

    doc.selection = livePaintGroups;
    app.executeMenuCommand("Live Paint Expand");
}

main();
