// Ungroup All.jsx
function ungroupAll(item){
    if(item.typename === "GroupItem"){
        for(var i = item.pageItems.length-1; i >= 0; i--){
            ungroupAll(item.pageItems[i]);
        }
        item.ungroup();
    }
}

if(app.documents.length > 0){
    var doc = app.activeDocument;
    for(var i = doc.pageItems.length-1; i >= 0; i--){
        ungroupAll(doc.pageItems[i]);
    }
}
