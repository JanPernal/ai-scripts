function main() {
    if (app.selection.length > 0) {
        app.executeMenuCommand('Live Paint Expand');
    } else {
        alert("Zaznacz grupę Live Paint!");
    }

}
main();