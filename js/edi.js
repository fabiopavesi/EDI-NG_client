/**
 *
 * Main module for EDI
 * It is responsible for orchestrating other modules and classes at the presentation level
 *
 * @author  Fabio Pavesi (fabio@adamassoft.it)
 *
 */

var edi = (function() {
    var callback;
    var settings;
    var endpointTypes = [];
    var form;
    var sparql = new SPARQL();
    var dataSources = [];
    var cloneSuffix = "_XritX";
    var uiLanguage = "it";
    var metadataLanguage = "it";
    var tempStructure = {};
    var theTemplate;
    var lastAlternativeGroup = 0;
    var generatedXml = undefined;

    function setLanguage(lang) {
        $("*[language]").addClass("hidden");
        $("*[language='" + lang + "']").removeClass("hidden").each(function() {
            $("#" + $(this).attr("for")).attr("placeholder", $(this).text());
        });
        uiLanguage = lang;
    }

    function setMetadataLanguage(lang) {
        DataSourcePool.getInstance().setLanguage(lang);
        DataSourcePool.getInstance().refreshAll();
    }

    function setLanguageSelector() {
        if (settings.languageSelection) {
            var languageSelector = "#" + settings.languageSelection.byItem;
            console.log("language selector: " + languageSelector);
            console.log($(languageSelector));
            $(languageSelector).addClass("languageSelector").change(function(){
                var optionSelected = $(this).find("option:selected");
                var selectedLanguage =  optionSelected.attr("language_neutral");
                // doDebug("html: " + optionSelected.html());
                // doDebug("selected language is " + selectedLanguage);
                var currentMetadataLanguage = lookupLanguage(selectedLanguage);
                setMetadataLanguage(currentMetadataLanguage);
            });
        }
    }

    function doDebug(message) {
        console.log(message);
    }


    function duplicateElement(element_id, newId, updateEdiml) {
        var div = $("div[represents_element='" + element_id + "']:last");
        element_id = div.attr("id");
        newId = div.attr("id") + cloneSuffix;
        var found = false;

        // doDebug("duplicating " + element_id);
        var newDiv = div.clone();
        var newDivString = String(newDiv.html());
        newDiv.html(newDivString.replaceAll("\"" + element_id, "\"" + newId));
        newDiv.find('.duplicator').remove();

        newDiv.find('button[removes]').remove();
        // var label = newDiv.find('label[for="' + element_id + cloneSuffix + '"]').first();
        newDiv.find('a[for="' + newId + '"]').remove();
        newDiv.attr("id", newId);

        var button = newDiv.prepend("<button removes='" + newId + "' id='" + newId + "_remover' type='button' class='btn btn-mini btn-danger btn-remover'>X</button>").children("button[removes]");
// doDebug(button);
        // For some obscure reason it closes <http:> tag it finds in SPARQL queries
        // quick and dirty fix:

        newDiv.find("*[query]").each(function() {
            $(this).attr("query", $(this).attr("query").replaceAll("></http:>", "/>"));
        });
        // end of quick and dirty fix
        div.after(newDiv);

        var relevantDatasources = DataSourcePool.getInstance().findByTriggeredItemInElement(element_id);
        if ( $.isArray(relevantDatasources) ) {
            for ( var i = 0; i < relevantDatasources.length; i++ ) {
                var datasource = relevantDatasources[i];
                var id = datasource.getId();
                var newTriggerItem = datasource.parameters.triggerItem.replace(element_id, newId);
                var newSearchItem = datasource.parameters.searchItem.replace(element_id, newId);
                var newDs = DataSourcePool.getInstance().duplicateDatasource(id, newTriggerItem, newSearchItem);
                var newDsId = newDs.parameters.id;
                newDs.refresh();
                // DataSourcePool.getInstance().add(newDs);
                newDiv.find("*[datatype='select']", "*[datasource='" + id + "']").each(function(){
                    $(this).attr("datasource", newDsId);
                    var theId = $(this).attr("id");
                    var field = $(this).attr("field");
                    var ds = DataSourcePool.getInstance().findById(newDsId);
                    console.log("creating dependency on datasource " + $(this).attr("datasource") + " for item " + theId);
                    ds.addEventListener("selectionChanged", function (event) {
                        var ds = DataSourcePool.getInstance().findById(newDsId);
                        console.log(event + " received by " + theId);
                        var row = ds.getCurrentRow();
                        if ( row ) {
                            $("#" + theId).val(row[field]).trigger("change");
                        } else {
                            $("#" + theId).val("").trigger("change");
                        }

                    });
                    ds.refresh();
                });
            }
        }

        // newDiv.find("*").unbind("change");
        if ( updateEdiml ) {
            ediml.duplicateElement(element_id, newId);
        }
        newDiv.find(".datepicker").datepicker({
            format: "yyyy-mm-dd"
        }).on('changeDate', function(ev) {
            // $("#" + $(this).attr("Textbox")).val(ev.date.valueOf());
            // doDebug("data: " + ev.date.valueOf());
            $(this).datepicker('hide');
        });

        // newDiv.find("*[datatype='autoCompletion']").unbind();

        newDiv.find(".tt-input").typeahead('destroy');
        newDiv.find(".tt-hint").remove();
        newDiv.find(".tt-dropdown-menu").remove();
        newDiv.find("pre[aria-hidden='true']").remove();

        newDiv.find(".tt-input[datatype='autoCompletion']").each(function() {
            var id = $(this).attr("id");
            var span = $(this).parent();
            var self = $(this);
            $(this).parent().before($(this));
            span.remove();

            self.removeClass("tt-input");
            self.removeAttr("style").removeAttr("dir").removeAttr("spellCheck");
            self.typeahead({
                    hint: true,
                    highlight: true,
                    minLength: 3
                },
                {
                    name: "ds_" + id + "",
                    displayKey: 'l',
                    source: substringMatcher(self.attr("datasource"), id)
                }).bind('typeahead:selected', function(obj, datum, name) {
                    $("#" + id + "_uri").val(datum.c).trigger("change");
                    $("#" + id + "_urn").val(datum.urn);
                    var ds = DataSourcePool.getInstance().findById(self.attr("datasource"));
                    ds.setCurrentRow("c", datum.c);
                }).blur(function(event) {
                    console.log("Changed: " + event.target.value);
                    if ( event.target.value.trim() == "" ) {
                        $("#" + id + "_uri").val("");
                        $("#" + id + "_uri").trigger("change");
                        $("#" + id + "_urn").val();
                        $("#" + id + "_urn").trigger("change");
                        ediml.updateItemForControl($("#" + id));
                        var ds = DataSourcePool.getInstance().findById(item.datasource);
                        ds.setCurrentRow("c", -1);
                    }
                });
        });

        newDiv.find("*[datatype='dependent']").each(function() {
            doDebug("setting " + $(this) + " as dependent item");
            prepareDependent($(this));
        });
        $(".input-group.date").datepicker();
        newDiv.find("button[removes]").click(function() {
            // alert('#' + $(this).attr("removes"));
            var element_id = $(this).attr("removes");
            var div = $('#' + $(this).attr("removes"));
            div.find($("*[datasource]")).each(function() {
                var dp = DataSourcePool.getInstance();
                var dsId = $(this).attr("datasource");
                var ds = dp.findById(dsId);
                if ( ds && ds.parameters.cloned ) {
                    console.log("removing datasource " + ds.parameters.id);
                    dp.remove(ds.parameters.id);
                }
            });
            div.remove();
            ediml.removeElement(element_id);
            // doDebug(elements);
        });
        newDiv.find("*[defaultValue]").each(function() {
            // console.log(this + " -> " + $(this).attr("defaultValue"));
            $(this).val($(this).attr("defaultValue"));
            $(this).trigger("change");
        });


        // $(this).detach().appendTo(newDiv);
        // find element in array
        // doDebug(elements);
        found = false;
        for ( i = 0; !found && i < elements.length; i++ ) {
            if ( elements[i].id == element_id ) {
                var existingElement = elements[i];
                newElement = clone(existingElement);
                newElement.id = element_id + cloneSuffix;
                // doDebug("pushing " + newElement.id);
                // doDebug(newElement);
                addElement(newElement);
                found = true;
            }
        }
        // doDebug(elements);
        // ediml.startListening();

    }


    function duplicators() {
        $('.duplicator').click(function() {
            duplicateElement($(this).attr("duplicates"), $(this).attr("duplicates") + cloneSuffix, true);
        });
    }

    function getParameter(parameter) {
        var pars = decodeURIComponent(querystring("parameters"));
        var par;
        console.log("loading querystring parameters");
        console.log(pars);
        if ( pars && pars != "undefined" && pars != "" ) {
            pars = JSON.parse(pars);
            return pars[parameter];
        }
    }

    function loadQuerystringDefaults() {
        var pars = decodeURIComponent(querystring("parameters"));
        var par;
        console.log("loading querystring parameters");
        console.log(pars);
        if ( pars && pars != "undefined" && pars != "" ) {
            pars = JSON.parse(pars);
            // doDebug(pars);
            // doDebug(pars.uid);
            $("*[querystringparameter]").each(function() {
                console.log($(this));
                console.log($(this).text());
                doDebug("evaluating " + ("pars." + $(this).attr("querystringparameter")));
                par = eval("pars." + $(this).attr("querystringparameter"));
                doDebug("input id='" + $(this).attr("id")  + " -> parametro '" + $(this).attr("querystringparameter") + "' = '" + par + "'");
                if ( par && par != "undefined" && par != "" ) {
                    $(this).val(par);
                    $(this).trigger("change");
                }
            });
        }
    }

    function prepareDependent(which) {
        var thisOne = which;
        doDebug(thisOne);

        var item = ediml.findItemById(thisOne.attr("id"));

        var query = item.query.toString();
        var regex = "";

        if ( typeof query.match !== "function" ) {
            console.log("query");
            console.log(query);
            return;
        }
        var reference = query.match(/\$(.*)\$/i)[1];
        var principal;
        if ( reference.indexOf("_") >= 0 ) {
            principal = reference;
        } else {
            principal = item.elementId + "_" + reference;
        }
        thisOne.attr("dependsOn", principal);

        console.log("dependent item " + thisOne.attr("id") + " depending on " + principal + ", query: " + query);
        // doDebug("item " + $(this).attr("id") + " -> " + regex.test(query));
        console.log("item " + "_" + thisOne.attr("id") + " -> " + item.elementId + "_" + query.match(/\$(.*)\$/i)[1]);
        // $("#" + principal).unbind("change");
        $("#" + principal + "_uri").bind("change", function() {
            doDebug("cambiamento di " + $(this).attr("id"));
            doDebug("scatta: " + thisOne.attr("id"));
            var originalQuery = query;
            var queryInstance = replaceAll(query, /\$(.*)\$/i, $("#" + principal + "_uri").val() );
            var queryInstance = queryInstance.replace("</http:>", "");
            var sparql = new SPARQL(settings.sparqlEndpoint);

            thisOne.addClass("loading");
            sparql.specificQuery(
                queryInstance,
                function( data ) {
                    dati = data.results.bindings;
                    thisOne.val(dati[0] ? dati[0].l.value : "");
                    thisOne.removeClass("loading");
                    ediml.updateItemForControl(thisOne);
                    thisOne.trigger("change");
                },
                function() {
                    console.log(arguments);
                    thisOne.removeClass("loading");
                }
            );
            /*
            $.getJSON( virtuosoUrl, {
                query: queryInstance,
                format: 'application/sparql-results+json',
                save:'display',
                fname : undefined
            }, function( data ) {
                dati = data.results.bindings;
                thisOne.val(dati[0] ? dati[0].l.value : "");
            });
            */

        });
    }

    var prepareDependents = function() {
        doDebug("prepareDependents");
        $(".dependent").each(function() {
            prepareDependent($(this));
        });
    }

    function fillInCombos(data, datasource) {
        var toBeRefreshed = [];

        /*
        var ds = DataSourcePool.getInstance().findById(datasource);
        data = ds.getResultSet();
        */
        // console.log(data);
        html = "";
        if ( typeof data !== "undefined" ) {
            for ( var i = 0; i < data.length; i++ ) {
//                html += "<option value='" + ( data[i].c ? data[i].c.value : "" ) + "'" + (data[i].z ? " language_neutral='" + data[i].z.value + "'" : "") + ">" + ( data[i].a ? data[i].a.value : data[i].l.value ) + "</option>";
                html += "<option value='" + ( data[i].c ? data[i].c : "" ) + "'" + (data[i].z ? " language_neutral='" + data[i].z + "'" : "") + ">" + ( data[i].a ? data[i].a : ( data[i].l ? data[i].l : data[i].z ) ) + "</option>";
            }
        }
        $("select").filter("*[datasource='" + datasource + "']").each(function() {
            self = $(this);
            var originalValue = self.val();
            self.html(html);
            // updateDefaults();
            self.val([]);
            if (typeof self.attr("defaultValue") !== "undefined" && self.attr("defaultValue") != "") {
                self.val(self.attr("defaultValue"));
                console.log(self.attr("id") + " -> " + self.attr("defaultValue"));
                // self.trigger("change");
                toBeRefreshed.push(self.attr("id"));
            }
            if (typeof self.attr("querystringparameter") !== "undefined" && self.attr("querystringparameter") != "") {
                self.val(getParameter(self.attr("querystringparameter")));
                console.log(self.attr("id") + " -> " + getParameter(self.attr("querystringparameter")));
                // self.trigger("change");
                toBeRefreshed.push(self.attr("id"));
            }
            console.log("orginal value: " + originalValue);
            if ( originalValue != null ) {
                self.val([]);
                self.val(originalValue);
                console.log(self.attr("id") + " -> " + originalValue);
                // self.trigger("change");
                toBeRefreshed.push(self.attr("id"));
            }

            console.log(self.attr("id") + " = " + self.val());
            if ( self.attr("required") && self.val() == null ) {
                self.val($("#" + self.attr("id") + " option:first-child").val());
                console.log(self.attr("id") + " -> first item in combo");
                toBeRefreshed.push(self.attr("id"));
            }
        });
        for ( var i = 0; i < toBeRefreshed.length; i++ ) {
            // console.log(toBeRefreshed);
            var item = ediml.findItemById(toBeRefreshed[i]);
            ediml.update(item);
            console.log(item);
            $(toBeRefreshed[i]).change();
        }
        $(".container").removeClass("loading");

    }

    function runQueries() {

        DataSourcePool.getInstance().stopNotifying();

    }

    function autoCompletionQuery(item, query, process) {
        console.log(item);
        console.log(query);
        console.log(process);
    }

    var substringMatcher = function(datasource, id) {
        return function findMatches(q, cb) {
            var matches, substrRegex;

            var item = ediml.findItemById(id);
            var ds = DataSourcePool.getInstance().findById(item.datasource);
            if ( typeof ds === "undefined" ) {
                console.log("can't find datasource " + item.datasource + " for id " + id);
                console.log(item);
                return;
            }
            ds.addListener(function(data) {
                // console.log(data);
                cb(data);
            });
            ds.setSearchItem(id);
            ds.refresh();
            return;

            console.log(q);
            console.log(query);
            // an array that will be populated with substring matches
            matches = [];
            var sparql = new SPARQL();
            var newQuery = query.replace(/\$search_param/gi, q);
            console.log(newQuery);
            sparql.specificQuery(
                newQuery,
                function(data) {
                    data = data.results.bindings;
                    for ( var i = 0; i < data.length; i++ ) {
                        // console.log(data[i]);
                        var record = {};
                        // {ttValue: data[i].c.value, value: data[i].l.value, uri: data[i].c.value, urn: ( data[i].urn ? data[i].urn.value : "" )}
                        record.ttVaue = data[i].c.value;
                        // console.log("bindings row has " + data[i].length + " fields");
                        for ( var field in data[i] ) {
                            // console.log(field);
                            record[field] = data[i][field].value;
                        }
                        matches.push(record);
                    }
                    // console.log(matches);
                    // console.log(cb);

                    cb(matches);
                },
                function() {
                    console.log(arguments);
                }
            );
            // cb(matches);
        };
    };

    function compileItem(div, item, element) {
        var id = div.attr("id") + "_" + item.hasIndex;
        var showType = ItemRenderer.getRenderer(item);

        var html = "<control_" + showType + " id=\"" + id + "\" ";
/*
        for ( var propertyName in item ) {
            if ( propertyName != "label" && propertyName != "help" && propertyName != "show" ) {
                html += propertyName + "=\"" + item[propertyName] + "\" ";
            }
        }
*/
        tempStructure[id] = {};
        tempStructure[id].item = item;
        tempStructure[id].item.id = id;
        tempStructure[id].element = element;

        html += ">";
        var labels = "<labels>";
        if ( item.label ) {
            for (var k = 0; k < item.label.length; k++) {
                labels += "<label for='" + id + "' language='" + item.label[k]["_xml:lang"] + "";
                labels += "'>" + item.label[k]["__text"] + "</label>";
            }
        }
        var helps = "<helps>";
        if ( item.help ) {
            for (var k = 0; k < item.help.length; k++) {
                helps += "<help for='" + id + "' language='" + item.help[k]["_xml:lang"] + "";
                helps += "'>" + item.help[k]["__text"] + "</label>";
            }
        }
        helps += "</helps>";
        html += labels + "</control_" + showType + ">";

        div.append(html);
    }

    function compileElement(div, element) {
        // console.log(element);
        var atLeastOneEditableItem = false;
        var theElement = new Element();
        theElement.id = element.id;
        theElement.mandatory = element.isMandatory;
        theElement.root = element.hasRoot;
        theElement.represents_element = element.id;
        theElement.alternativeTo = element.alternativeTo;

        ediml.addElement(theElement);

        div.attr("root", element.hasRoot);
        div.attr("mandatory", element.isMandatory);
        div.attr("multiple", element.isMultiple);
        div.attr("represents_element", element.id);
        div.attr("alternativeTo", element.alternativeTo);
        if ( $.isArray(element.label) ) {
            for (var k = 0; k < element.label.length; k++) {
                div.append("<label class='form-label" + (element.label[k]["_xml:lang"] == uiLanguage ? "" : " hidden") + "' language='" + element.label[k]["_xml:lang"] + "'>" + element.label[k]["__text"] + "</label>");
            }
        } else if ( element.label ) {
            div.append("<label class='form-label" + (element.label["_xml:lang"] == uiLanguage ? "" : " hidden") + "' language='" + element.label["_xml:lang"] + "'>" + element.label["__text"] + "</label>");
        }
        if ( element.help ) {
            for ( var j = 0; j < element.help.length; j++ ) {
                var temp = '<span class="help-inline" language="' + element.help[j]["_xml:lang"] + '">';
                temp += '<a data-content="' + element.help[j]["__text"] + '" data-original-title="' + div.find("label[language='" + element.help[j]["_xml:lang"] + "']").text() + '" data-trigger="hover" data-toggle="popover" href="javascript:void(0)">';
                temp += '&nbsp;<span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span>';
                temp += '</a>';
                temp += '</span>';
                div.append( temp );
            }
        }
        if ( element.produces ) {
            if ( $.isArray(element.produces.item) ) {
                for (var i = 0; i < element.produces.item.length; i++) {
                    // console.log(element.produces.item[i]);
                    if (element.produces.item[i].isFixed == "false") {
                        atLeastOneEditableItem = true;
                    }
                    compileItem(div, element.produces.item[i], element);
                }
            } else {
                if (element.produces.item.isFixed == "false") {
                    atLeastOneEditableItem = true;
                }
                compileItem(div, element.produces.item, element);
            }
        }
        if ( !atLeastOneEditableItem ) {
            div.addClass("no-children");
        }
        if ( element.isMultiple == "true" ) {
            for (var k = 0; element.label && k < element.label.length; k++) {
                div.append("<button role='button' duplicates='" + element.id + "' class='btn btn-primary btn-sm duplicator" + (element.label[k]["_xml:lang"] == uiLanguage ? "" : " hidden") + "' language='" + element.label[k]["_xml:lang"] + "'>+ " + element.label[k]["__text"] + "</button>");
            }
        }
        if ( element.isMandatory != "NA" ) {
            div.addClass("mandatory");
        }
        // $("#debug").append("<p>" + element.id + "</p>");
        // console.log(element.id);
    }
    var groupCounter = 0;
    function compileGroup(group) {
        // $("#debug").append("<ul>" + group.id + "</ul>");
        var navigation = $("#myTab");
        navigation.append("<li><a href='#" + group.id + "' id='linkTo_" + group.id + "' " + /* "data-toggle='tab'" + */"></a></li>");
        form.append("<div id='" + group.id + "' " /* + "class='" + ( groupCounter++ == 0 ? " active" : "") */ + "'>");
        var div = $("#" + group.id).
            append("<div class='panel panel-primary'><div class='panel-heading'>").children("div").children("div");
        for ( var j = 0; j < group.label.length; j++ ) {
            div.append("<h3 class='form-label" + (group.label[j]["_xml:lang"] == uiLanguage ? "" : " hidden") + "' language='" + group.label[j]["_xml:lang"] + "'>" + group.label[j]["__text"] + "</h3>");
            $("#linkTo_" + group.id).append("<label class='form-label" + (group.label[j]["_xml:lang"] == uiLanguage ? "" : " hidden") + "' language='" + group.label[j]["_xml:lang"] + "'>" + group.label[j]["__text"] + "</label>");
        }
        div = div.parent().append("<div class='panel-body'>").children("div.panel-body");
        if ( group.help ) {
            for ( var j = 0; j < group.help.length; j++ ) {
                div.append("<p language='" + group.help[j]["_xml:lang"] + "'>" + group.help[j]["__text"] + "<p>" );
            }
        }
        if ( !$.isArray(group.element) ) {
            group.element = [group.element];
        }
        for (var j = 0; j < group.element.length; j++) {
            var element = group.element[j];
            div.append("<div id='" + element.id + "' class='element'>");
            var elementDiv = $("#" + element.id);
            compileElement(elementDiv, group.element[j]);
        }
        $('[data-toggle="popover"]').popover();
        $("body").scrollspy();
    }

    function updateDefaults() {
        $("*[defaultValue]").each(function() {
            // console.log(this + " -> " + $(this).attr("defaultValue"));
            $(this).val($(this).attr("defaultValue"));
            $(this).trigger("change");
        });
        loadQuerystringDefaults();
        if ( querystring("edit") ) {
            ediml.loadEDIML(querystring("edit"), function (data) {
                ediMl = data;
                ediml.fillInEdiMl(ediMl);
            });
        }
        if ( querystring("duplicate") ) {
            ediml.loadEDIML(querystring("duplicate"), function (data) {
                ediMl = data;
                ediml.fillInEdiMl(ediMl);
                ediml.content.elements.fileId = undefined;
            });
        }
    }

    function fixOneItemArrays(data) {
        // XML arrays with one item will be converted, in JSON, to plain objects
        // we need to fix this
        if ( !$.isArray(data.group) ) {
            data.group = [data.group];
        }
        for ( var i = 0; i < data.group.length; i++ ) {
            if ( !$.isArray(data.group[i].element) ) {
                data.group[i].element = [data.group[i].element];
            }
            for ( var j = 0; j < data.group[i].element.length; j++ ) {
                if ( data.group[i].element[j].produces ) {
                    if ( !$.isArray(data.group[i].element[j].produces.item) ) {
                        data.group[i].element[j].produces.item = [data.group[i].element[j].produces.item];
                    }
                }
            }
        }
        return data;
    }

    function onTemplateLoaded(template, version, data) {
        settings = data.settings;
        $("#template-version").text(template + " v" + version);
        $("#debug").append("<p>template loaded</p>");

        data = fixOneItemArrays(data);
        theTemplate = data;

        endpointTypes = [];
        console.log("endpoints");
        if ( data.endpointTypes ) {
            if ( !$.isArray(data.endpointTypes.endpointType) ) {
                data.endpointTypes.endpointType = [data.endpointTypes.endpointType];
            }

            for ( var i = 0; i < data.endpointTypes.endpointType.length; i++ ) {
                var e = data.endpointTypes.endpointType[i];
                console.log(e);
                var endpointType = new EndpointType(e);
                console.log(endpointType);
                endpointTypes[e.id] = endpointType;
            }
        }
        console.log("endpoints end");

        if ( data.datasources ) {
            var dss = data.datasources.datasource;
            for (var i = 0; i < dss.length; i++) {
                // console.log(dss[i]);
                var ds = new DataSource({
                    id: dss[i].id,
                    type: dss[i].type,
                    uri: dss[i].uri,
                    url: ( dss[i].url ? dss[i].url : settings.sparqlEndpoint),
                    endpointType: dss[i].endpointType,
                    query: dss[i].query,
                    searchItem: dss[i].searchItem,
                    triggerItem: dss[i].triggerItem,
                    singleton: dss[i].singleton,
                    ready: function (data) {
                        // console.log("ds callback success");
                        // console.log(data);
                    }
                });
                dataSources.push(ds);
            }
        }
        // console.log(dataSources);
//        return;

        // console.log(data.group);
        var groups = data.group;
        if ( !$.isArray(groups) ) {
            groups = [ groups ];
        }
//        form = $("#theForm").append("<form role='form' method='post'>").children("form");
        form = $("#theForm").append("<div>").children("div");
        ediml.inheritSettings(settings);
        ediml.content.elements.template = template;
        ediml.content.elements.version = version;
        for ( var i = 0; i < groups.length; i++ ) {
            compileGroup(groups[i]);
        }

        ItemRenderer.render();

        $(".codelist:not([datasource]), .typeahead[id]:not([datasource])").addClass("no-datasource").each(function() {
            $(this).after("<label class='no-datasource'>missing datasource</label>");
        });

        setLanguage(uiLanguage);
        metadataLanguage = settings.defaultLanguage;
        setMetadataLanguage(metadataLanguage);
        setLanguageSelector();

        DataSourcePool.getInstance().addListener("allReady", function(event) {
            console.log("all datasets loaded");
            runQueries();
        });

        var datasources = DataSourcePool.getInstance().datasources();
        for ( var i = 0; i < datasources.length; i++ ) {
            var ds = datasources[i];
            ds.addListener(fillInCombos);
        }
        duplicators();

        $("*[datatype='copy']").each(function() {
            var id = $(this).attr("id");
            var item = ediml.findItemById(id);

            console.log(item.id);
            $("#" + item.itemId).change(function (event) {
                console.log(event + " received");
                if ( item.show != "label" ) {
                    $("#" + item.id).val($(this).val()).change();
                } else {
                    $("#" + item.id).text($(this).val()).change();
                }
            });
        });

        $("*[datatype='select']").each(function(){
            var id = $(this).attr("id");
            var item = ediml.findItemById(id);
            var ds = DataSourcePool.getInstance().findById(item.datasource);
            console.log("creating dependency on datasource " + item.datasource + " for item " + item.id);
            ds.addEventListener("selectionChanged", function (event) {
                console.log(event + " received by " + item.id);
                var row = ds.getCurrentRow();
                if ( row ) {
                    $("#" + item.id).val(row[item.field]).trigger("change");
                } else {
                    $("#" + item.id).val("").trigger("change");
                }
            });
        });

        $("*[alternativeto]").addClass("alternativeElement").each(function() {
            var element = ediml.getElement($(this).attr("id"));
            var altElement = ediml.getElement(element.alternativeTo);
            var first = $("#" + element.id);
            var second = $("#" + altElement.id);
            if ( !first.parent().hasClass("alternativeGroup") ) {
                $("#" + element.id + ", #" + altElement.id).wrapAll("<div id='alt_" + (++lastAlternativeGroup) + "' class='alternativeGroup'/>");
                first.append("<span class='oppure'>" + localise("OR") + "</span>");
            }
        });
        /*
        $("*[alternativeto] input").keyup(function() {
            var item = ediml.findItemById($(this).attr("id"));
            var element = ediml.getElement(item.elementId);
            var altElement = ediml.getElement(element.alternativeTo);
            for ( var i = 0; i < altElement.items.item.length; i++ ) {
                $("#" + altElement.items.item[i].id).val([]);
            }
        });
        */
        DataSourcePool.getInstance().refreshAll();
        $(".date-input, .dateRange-input").datepicker({
            format: "yyyy-mm-dd",
            todayHighlight: true,
            autoclose: true
        });
        $(".dependent-input").each(function() {
            prepareDependent($(this));
        });

        ediml.startListening();
        updateDefaults();
        setLanguage(uiLanguage);

        if ( typeof callback === "function" ) {
            callback(data);
        }

    }

    function edimlOutput() {
        console.log(JSON.stringify(ediml.content, undefined, 4));
        $("#ediml").html('<pre class="prettyprint lang-json" draggable="true">' + JSON.stringify(ediml.content, undefined, 4) + '</pre>');
        prettyPrint();
        // console.log(new Date());
    }

    function loadLocalTemplate(template, version, theCallback) {
        callback = theCallback;
        $.support.cors = true;
        // $(".container").addClass("loading");
        $.ajax({
                   // url: "http://sp7.irea.cnr.it/jboss/MDService/rest/admin/templates/" + template + "/" + version,
                   url: template + "_v" + version + ".xml?__=" + Math.random(),
                   type: "get",
                   dataType: "xml",
                   success: function(data) {
                       var x2j = new X2JS({});
                       data = x2j.xml2json(data);
                       // console.log(data);
                       onTemplateLoaded(template, version, data.template);
                   }
        });
    }

    function loadTemplate(template, version, theCallback) {
        callback = theCallback;
        // $(".container").addClass("loading");
        $.ajax({
            // url: "http://sp7.irea.cnr.it/jboss/MDService/rest/admin/templates/" + template + "/" + version,
            url: defaults.metadataEndpoint + "rest/admin/templates/" + template + "/" + version,
            type: "get",
            dataType: "xml",
            success: function(data) {
                var x2j = new X2JS({});
                data = x2j.xml2json(data);
                // console.log(data);
                onTemplateLoaded(template, version, data.template);
            }
        });
    }

    function loadTemplateFromUrl(url, theCallback) {
        callback = theCallback;
        $.ajax({
            // url: "http://sp7.irea.cnr.it/jboss/MDService/rest/admin/templates/" + template + "/" + version,
            url: url,
            type: "get",
            dataType: "xml",
            success: function(data) {
                var x2j = new X2JS({});
                data = x2j.xml2json(data);
                // console.log(data);
                onTemplateLoaded(template, version, data.template);
            }
        });
    }

    // Initialisation code


    return {
        cloneSuffix: cloneSuffix,
        loadTemplate: loadTemplate,
        loadLocalTemplate: loadLocalTemplate,
        loadTemplateFromUrl: loadTemplateFromUrl,
        duplicateElement: duplicateElement,
        setLanguage: setLanguage,
        substringMatcher: substringMatcher,
        edimlOutput: edimlOutput,
        endpointTypes: endpointTypes,
        getEndpointTypes: function(which) {
            return endpointTypes[which];
        },
        settings: function() {return settings;},
        getTemplate: function() {return theTemplate},
        uiLanguage: function() {
            return uiLanguage;
        },
        getTempStructure: function() {
            return tempStructure;
        },
        setGeneratedXml: function(xml) {
            generatedXml = xml;
        },
        getGeneratedXml: function() {
            return generatedXml;
        }
    };
})();