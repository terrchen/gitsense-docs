const h = require("../../../../app/utils/html.js");
const DropDownMenu = require("../../../../app/components/drop-down-menu.js");

function Options(widget, callbacks) {
    const {
        onClickButton
    } = callbacks;

    let blocksMenu = null;
    let minWordsMenu = null;
    let modelsMenu = null;
    let promptsMenu = null;
    let temperatureMenu = null;

    let options = null;

    this.init = async function() {
        await initOptions();
    }

    this.render = function(renderTo) {
        render(renderTo);
    }

    this.getAllSelected = function() {
        return {
            block: blocksMenu.getSelected().toLowerCase(),
            minWords: minWordsMenu.getSelected(),
            model: modelsMenu.getSelected().split(" [").shift(),
            provider: modelsMenu.getSelected().split("[").pop().replace("]", "").toLowerCase(),
            prompt: promptsMenu.getSelected(),
            temperature: temperaturesMenu.getSelected(),
        };
    }

    async function initOptions() {
        options = await getOptions();
    }

    function render(renderTo) {
        const { blocksBody, minWordsBody, modelsBody, promptsBody, temperaturesBody, buttonBody } = renderLayout(renderTo);
    
        blocksMenu = addOption("Block", getBlocks(), changedBlock, blocksBody);
        minWordsMenu = addOption("Min words", getMinWords(), changedMinWords, minWordsBody);
        modelsMenu = addOption("Model", getModels(), changedModel, modelsBody);
        promptsMenu = addOption("Prompt", getPrompts(), changedPrompt, promptsBody);
        temperaturesMenu = addOption("Temperature", getTemperatures(), changedTemperature, temperaturesBody);

        addButton(buttonBody);
    
        function changedBlock() {
    
        }
    
        function changedMinWords() {
    
        }
    
        function changedModel() {
    
        }
    
        function changedPrompt() {
    
        }
    
        function changedTemperature() {
    
        }
    
        function renderLayout(renderTo) {
            const buttonWidth = 100;
    
            const blocksBody = h.createDiv({
                style: {
                    display: "inline-block",
                    marginRight: "20px",
                }
            });
    
            const minWordsBody = h.createDiv({
                style: {
                    display: "inline-block",
                    marginRight: "20px",
                }
            });
    
            const modelsBody = h.createDiv({
                style: {
                    display: "inline-block",
                    marginRight: "20px",
                }
            });
    
            const promptsBody = h.createDiv({
                style: {
                    display: "inline-block",
                    marginRight: "20px",
                }
            });
    
            const temperaturesBody = h.createDiv({
                style: {
                    display: "inline-block",
                    marginRight: "20px",
                }
            });
    
            const buttonBody = h.createDiv({
                style: {
                    width: `${buttonWidth}px`,
                    display: "inline-block",
                    verticalAlign: "middle"
                }
            });
    
            const menusBody = h.createDiv({
                append: [
                    blocksBody,
                    minWordsBody,
                    modelsBody,
                    promptsBody,
                    temperaturesBody
                ],
                style: {
                    display: "inline-block",
                    width: `calc(100% - ${buttonWidth}px)`,
                    verticalAlign: "middle"
                }
            });
    
            renderTo.appendChild(menusBody);
            renderTo.appendChild(buttonBody);
    
            return { blocksBody, minWordsBody, modelsBody, promptsBody, temperaturesBody, buttonBody };
        }
    
        function addOption(type, options, callback, renderTo) {
            const menu = new DropDownMenu(
                options,
                `<strong>${type}: </strong>`, 
                { 
                    dropDownClass: "color-fg-muted d-inline",
                    dropDownStyle: {
    
                    },
                    menuStyle: { 
                        width: "200px" 
                    },
                    callback
                }
            );

            renderTo.appendChild(menu.create());
            return menu;
        }
    
        function addButton(renderTo) {
            const button = h.createSpan({
                text: "Analyze",
                cls: "btn btn-primary",
                style: {
    
                }
            });
    
            renderTo.appendChild(button);

            button.onclick = () => {
                if ( onClickButton )
                    onClickButton();
            };
        }
    
        function getBlocks() {
            const blocks = [];
    
            options.blocks.forEach(block => {
                const { scope: value, default: selected } = block;
                blocks.push({ value, selected });
            });
    
            return blocks;
        }
    
        function getModels() {
            const models = [];
    
            options.models.forEach(model => {
                const { name: modelName, providers } = model;
    
                providers.forEach(provider => {
                    const { name: providerName, default: selected } = provider;
                    models.push({ value: `${modelName}`, selected });
                });
            });
    
            return models;
        }
    
        function getMinWords() {
            const { defaultMinWords } = options;
            const minWords = [];
            const start = 1;
            const end = 5;
    
            for ( let i = start; i <= end; i++ )
                minWords.push({ value: i, selected: i === defaultMinWords });
    
            if ( defaultMinWords > end )
                minWords.push({ value: defaultMinWords, selected: true });
    
            return minWords;
        }
    
        function getPrompts() {
            const prompts = [];
    
            options.prompts.forEach(prompt => {
                const { name: value, default: selected } = prompt;
                prompts.push({value, selected});
            });
    
            return prompts;
        }
    
        function getTemperatures() {
            const { defaultTemperature } = options;
            const temperatures = [];
            const start = 0;
            const end = 1;
            const increment = .1;
    
            for ( let i = start; i <= end; i += increment )
                temperatures.push({ value: i.toFixed(2), selected: i === defaultTemperature });
    
            return temperatures;
        }
    }

    async function getOptions() {
        const usp = new URLSearchParams();
        usp.set("type", "options");
    
        const response = await fetch(widget.dataURL+"?"+usp.toString());
        const json = await response.json();
        const { status, data } = json;
        return data;
    }
}

module.exports = { Options };
