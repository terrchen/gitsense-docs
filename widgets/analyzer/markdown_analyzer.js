const cheerio = require("cheerio");
const crypto = require("crypto");
const MarkDownIt = require("markdown-it");
const { sleep }  = require("../../../../libs/utils.js");
const sp = require("sentence-splitter");
const h = require("../../../../app/utils/html.js");
const cssFile = "gs-docs.css";
const className = "gs-docs";

function MarkdownAnalyzer(widget, path, config) {
    const { block: blockType, model, vendor, prompt, temperature } = config;
    const hash2Summary = {};
    const block2Window = {};

    let analyzing = false;
    let blocks = null;
    let markdown = null;

    this.init = async function() {
        await loadCSS(widget);

        const usp = new URLSearchParams();
        usp.set("path", path);
        usp.set("type", "markdown");
    
        const response = await fetch(widget.dataURL+"?"+usp.toString());
        const json = await response.json();
        const { status, data } = json;
        markdown = data;
    }

    this.render = async function(renderTo) {
        await render(renderTo);
    }

    this.analyzeNext = async function() {
        return await analyzeNext();   
    }

    this.getAllSummary = function() {
        return getAllSummary(); 
    }

    async function render(renderTo) {
        const md = new MarkDownIt({ html: true });
        const html = md.render(markdown);
        const mappedHTML = mapHTML(html);
    
        const body = h.createArticle({
            cls: "markdown-body",
            html: mappedHTML.join(""),
            style: {
                fontSize: "16px",
                paddingTop: "10px"
            }
        });
    
        renderTo.appendChild(body);
        defineBlocks();
    }

    async function analyzeNext() {
        if ( analyzing ) {
            console.log("WARNING: Analysis in progress. Ignoring analyze request.");
            return;
        }

        const block = getFirstUnanlyzedBlock();

        if ( !block )
            return;

        const { elem } = block;

        console.log(elem);

        analyzing = true;
        elem.style.backgroundColor = "yellow";
        await analyzeBlock(block);
        await sleep(500);
        elem.style.backgroundColor = null;
        analyzing = false;

        return getAllSummary();
    }

    async function analyzeBlock(block) {
        const { elem, hash: blockHash } = block;

        console.log("analyze block");
        console.log(block);
        console.log(elem.innerText);

        const body = {
            type: "ai-summary",
            "block-hash": blockHash,
            "block-type": blockType,
            "block-text": elem.innerText,
            model,
            vendor,
            prompt,
            temperature
        };

        const response = await fetch(widget.dataURL, {
            method: "POST",
            body: JSON.stringify(body),
            headers: {
                "Content-Type": "application/json"
            }
        });

        if ( !response.ok ) {
            console.log("FIXME: Implemet");
            return;
        }

        const json = await response.json();
        console.log(json);
        hash2Summary[blockHash] = true;
    }

    function defineBlocks() {
        blocks = [];
        const elems = document.getElementsByClassName(className);
    
        for ( let i = 0; i < elems.length; i++ ) {
            const elem = elems[i];
            const hash = elem.getAttribute("hash");
            const block = { elem, hash, id: elem.id, type: config.block };
            const links = elem.getElementsByTagName("a");
    
            for ( let i = 0; i < links.length; i++ )  {
                const link = links[i];
                link.style.pointerEvents = "none";
            }
    
            elem.onclick = () => { clickedBlock(block); };
            blocks.push(block);
        }
    }

    function mapHTML(html) {
        const $ = cheerio.load(html, null, false);
        const mappedHTML = [];
        let maxId = 0;
    
        // Start traversal from the root
        traverse($.root());
    
        // Remove the <root> tag
        if ( mappedHTML[0] === "<root>" ) { 
            mappedHTML.shift();
            mappedHTML.pop();
        }

        return mappedHTML;
    
        // Function to traverse and print element details
        function traverse(element) {
            const tagName = element[0]?.tagName || "root";
            const numKids = element.children().length;

            mappedHTML.push(getTag(tagName, element));
    
            if ( tagName === "p" || tagName.match(/^h\d/) || (tagName === "li" && !element.html().match(/(<ul.*>|<p.*>)/)) ) {
                const sentences = sp.split(element.html())
                    .filter(o => o.type === "Sentence")
                    .map(o => wrap(o.raw));
    
                mappedHTML.push(sentences.join(" ").trim());
                mappedHTML.push(`</${tagName}>`);
                return;
            }
    
            const hasSubList = tagName === "li" && element.html().match(/<ul.*>/);
    
            if ( hasSubList )
                mappedHTML.push(wrap(element.html().split(/<ul/)[0].trim()));
    
            // Recursively traverse child elements
            element.children().each((i, child) => {
                const tagName = $(child)[0].tagName;
    
                if ( hasSubList && tagName !== "ul" )
                    return;
    
                traverse($(child));
            });
    
            if ( numKids === 0 )
                mappedHTML.push(element.html());
    
            mappedHTML.push(`</${tagName}>`);
        }
    
        function getTag(tagName, element) {
            let tag = `<${tagName}`;
    
            if (element[0] && element[0].attribs) {
                Object.keys(element[0].attribs).forEach(attr => {
                    tag += ` ${attr}="${element[0].attribs[attr]}"`;
                });
            }
    
            tag += ">";
    
            return tag;
        }
    
        function wrap(html) {
            const hash = crypto.createHash("sha256").update(html).digest("hex");
            return `<span id="${(getId())}" class="${className}" hash="${hash}">${html}</span>`; 
    
            function getId() {
                return "span-"+(maxId++);
            }
        }
    }

    async function loadCSS(widget) {
        let url = widget.staticURL.replace("{file}", cssFile);
        let loaded = false;
    
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.type = "text/css";
        link.href = url;
        link.onload = () => { loaded = true };
        document.head.appendChild(link);
    
        const timeout = new Date().getTime() + 2000;
        await sleep(25);
    
        while ( new Date().getTime() < timeout ) {
            if ( loaded ) 
                return;
    
            await sleep(25); 
        }
    
        throw(`ERROR: Timedout while waiting for ${file} to load`); 
    }

    function getFirstUnanlyzedBlock() {
        for ( let i = 0; i < blocks.length; i++ ) {
            const block = blocks[i];

            if ( !hash2Summary[block.hash] )
                return block;
        }

        return null;
    }

    function getAllSummary() {
        return { "blah": "get all summary" };
    }

    function clickedBlock(block) {
        const { id, elem, hash } = block;
    
        if ( block2Window[id] ) {
            showOrHide(block2Window[id]);
            return;
        }
    
        const window = h.createDiv({
            style: {
                "border": "1px solid #ccc",
                "height": "100px",
                "marginTop": "10px"
            }
        });
    
        elem.insertAdjacentElement("afterend", window);
        block2Window[id] = window;
    
        function showOrHide(window)  {
            const isHidden = window.offsetParent === null;
    
            if ( isHidden )
                window.style.display = null;
            else
                window.style.display = "none";
        }
    }
}

module.exports = { MarkdownAnalyzer };
