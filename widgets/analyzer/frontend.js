const h = require("../../../../app/utils/html.js");
const { Options } = require("./options.js");
const { MarkdownAnalyzer } = require("./markdown_analyzer.js");
const { sleep }  = require("../../../../libs/utils.js");

let analyzing = false;

async function loaded(card) {
    const { widget } = card;
    const { fileBody, optionsBody, markdownBody } = renderLayout(card.main.body);
    const path = "README.md";

    const options = new Options(widget, { onClickButton: clickedButton });
    await options.init();
    options.render(optionsBody);

    const mda = new MarkdownAnalyzer(widget, path, options.getAllSelected());
    await mda.init();
    mda.render(markdownBody);

    function clickedButton() {
        if ( analyzing ) {
            analyzing = false;
            return;
        } 

        analyzeMarkdown(mda);
    }
}

function renderLayout(renderTo) {
    const summaryWidth = 250;

    const fileBody = h.createDiv({

    });

    const optionsBody = h.createDiv({
        style: {
            fontSize: "14px"
        }
    });

    const markdownBody = h.createDiv({
        style: {
            display: "inline-block",
            marginTop: "20px",
            width: `calc(100% - ${summaryWidth}px)`,
            paddingRight: "40px"
        }
    });

    renderTo.appendChild(fileBody);
    renderTo.appendChild(optionsBody);
    renderTo.appendChild(markdownBody);
    return { fileBody, optionsBody, markdownBody };
}

async function getSummary(widget, blocks) {
    const hashes = getHashes(blocks);
    const { dataURL } = widget;

    const response = await fetch(dataURL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            hashes: hashes,
            type: "summary"
        }),
    });

    const json = await response.json();
    const { status, data } = json;
    console.log(data);

    function getHashes(blocks) {
        const hashes = {};
    
        blocks.forEach(block => {
            hashes[block.hash] = true;
        });
    
        return Object.keys(hashes);
    }
}

async function analyzeMarkdown(mda) {
    let summary = null;

    do {
        summary = await mda.analyzeNext();
        console.log(summary);
    } while ( summary )
}

module.exports = { loaded };
