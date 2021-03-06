/**
 * Created by fabio on 02/03/2017.
 */

import {Injectable, NgZone} from '@angular/core';
import {
    IDatasource, CodelistDatasource, BaseDatasource, SingletonDatasource,
    SPARQLDatasource
} from '../../model/Datasource';
import {Http, Headers} from '@angular/http';
import {XML2JSON} from '../../utils/XML2JSON';
import {Observable} from 'rxjs';
import {isArray} from 'util';
import {ITemplate} from '../../model/Template';
import {State} from '../../model/State';
import {Element} from '../../model/Element';
import {EndpointType, ContentTypes, HTTPMethod, IEndpointType} from '../../model/EndpointType';
import {Endpoint} from '../../model/Endpoint';
import {Logger, availableContexts} from '../../utils/logger';
import {AlternativeGroup} from '../../model/AlternativeGroup';
import {Item} from '../../model/Item';
import {MetadataService} from './MetadataService';
import {CatalogueService} from './catalogue.service';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {BehaviorSubject} from 'rxjs/BehaviorSubject';
import {Subject} from 'rxjs/Subject';
import {ConfigService} from './ConfigService';

@Injectable()
export class EDITemplate {
    static logger = new Logger(availableContexts.EDI_TEMPLATE_SERVICE);
    timezones: any[] = [];
    path: string;
    x2js: XML2JSON = new XML2JSON();
    contents: any; //  ITemplate;
    private logger: Logger = new Logger(availableContexts.EDI_TEMPLATE_SERVICE);
    private loading = false;
    state: State;
    stateSubject: BehaviorSubject<State> = new BehaviorSubject<State>(null);
    backendPresent = false;

    constructor(private http: HttpClient, private metadataService: MetadataService, private catalogueService: CatalogueService, private configService: ConfigService) {
        Item.metadataService = this.metadataService;
        this.state = metadataService.state;
        this.stateSubject.next(this.state);
        this.getTimezones();
        this.checkLocalBackend();
    }

    checkLocalBackend() {
        this.http.get('/api/').subscribe((res: any) => {
                console.log('backend returns', res);
                if (res.status === 200 || res.status === 302) {
                    this.backendPresent = true;
                    this.metadataService.useLocal = true;
                } else {
                    this.backendPresent = false;
                    this.metadataService.useLocal = false;
                }
            },
            err => {
                console.log('backend unavailable');
                this.backendPresent = false;
                this.metadataService.useLocal = false;
            });
    }

    private minTommss(minutes: number) {
        const sign = minutes < 0 ? '-' : '';
        const min = Math.floor(Math.abs(minutes));
        const sec = Math.floor((Math.abs(minutes) * 60) % 60);
        return sign + (min < 10 ? '0' : '') + min + ':' + (sec < 10 ? '0' : '') + sec;
    }

    private getTimezones() {
        let url = 'https://raw.githubusercontent.com/dmfilipenko/timezones.json/master/timezones.json';
        this.http.get(url)
        /*
                    .map(res => res.json())
        */
            .subscribe((res: any) => {
                EDITemplate.logger.log('timezones', res);
                this.timezones = res;
                for (let t of this.timezones) {
                    t.formattedOffset = (t.offset >= 0 ? '+' : '') + this.minTommss(t.offset);
                }
                this.timezones.sort((a, b) => {
                    if (a.value > b.value) {
                        return 1;
                    } else if (a.value < b.value) {
                        return -1;
                    } else {
                        return 0;
                    }
                });
            });
    }

    getTimezone(s: string) {
        // EDITemplate.logger.log('getTimezone', s);
        for (let t of this.timezones) {
            if (t.abbr === s) {
                // EDITemplate.logger.log('getTimezone', 'found', t);
                return t;
            }
        }
    }

    private importEndpointTypes() {
        EDITemplate.logger.log('importEndpointTypes', this.contents.endpointTypes);
        for (let et of this.contents.endpointTypes.endpointType) {
            EDITemplate.logger.log(et);
            let endpointType: EndpointType = new EndpointType(et);
        }
    }

    private importDatasources() {
        let defaultMetadataEndpoint = this.contents.settings.metadataEndpoint;
        this.metadataService._defaultMetadataEndpoint = defaultMetadataEndpoint;

        EDITemplate.logger.log('importDatasources', this.contents.datasources);
        for (let ds of this.contents.datasources.codelist) {
            let d = new CodelistDatasource();
            d.fromTemplate(ds);
        }
        EDITemplate.logger.log('imported codelists', BaseDatasource.datasources);
        for (let ds of this.contents.datasources.sparql) {
            let d = new SPARQLDatasource();
            d.fromTemplate(ds);
        }
        for (let ds of this.contents.datasources.singleton) {
            let d = new SingletonDatasource();
            d.fromTemplate(ds);
        }
        EDITemplate.logger.log('imported datasources', BaseDatasource.datasources);
        /*
                for ( let dsType in this.contents.datasources ) {
                    if ( this.contents.datasources.hasOwnProperty(dsType) ) {
                        EDITemplate.logger.log('importDatasource dsType', dsType);
                        for ( let ds of (this.contents.datasources as any)[dsType] ) {
                            EDITemplate.logger.log('importDatasource ds', ds);
                        }
                    }
                }
        */
    }

    fixDatasources() {
        for (let ds of BaseDatasource.datasources) {
            if (ds instanceof SingletonDatasource) {
                (ds as SingletonDatasource).fixTriggerItem();
            }
        }
    }

    private fixArrays() {
        let object: any = this.contents;
        EDITemplate.logger.log('fixArrays', this.contents);
        if (!isArray(object.group)) {
            object.group = [object.group];
        }
        if (!isArray(object.endpointTypes.endpointType)) {
            object.endpointTypes.endpointType = [object.endpointTypes.endpointType];
        }
        if (!isArray(object.datasources)) {
//            object.datasources = [object.datasources];
            EDITemplate.logger.log('object.datasources', object.datasources);
            // let temp: any[] = [];
            for (let ds in object.datasources) {
                if (object.datasources.hasOwnProperty(ds)) {
                    EDITemplate.logger.log('fixDatasources', ds, object.datasources[ds]);
                    if (!isArray(object.datasources[ds])) {
                        // temp.push([object.datasources[ds]]);
                        object.datasources[ds] = [object.datasources[ds]];
                    } else {
                        // temp.push(object.datasources[ds]);
                    }
                }
            }
            // object.datasources = temp;
            EDITemplate.logger.log('object.datasources out', object.datasources);
        }

        for (let g of object.group) {
            if (!isArray(g.element)) {
                g.element = [g.element];
            }
            for (let e of g.element) {
                if (!isArray(e.produces.item)) {
                    e.produces.item = [e.produces.item];
                }
                for (let i of e.produces.item) {
                    i.id = e.id + '_' + i.hasIndex;
                }
            }
        }
        return object;
    }

    private fixBooleans() {
        let object: any = Object.assign({}, this.contents);
        object.settings.requiresValidation = (object.requiresValidation === 'true');
        return object;
    }

    private fixGroupsElementsAndItems() {
        let object: any = Object.assign({}, this.contents);
        let alternativeGroups = {};

        EDITemplate.logger.log('fixGroupsElementsAndItems', object);
        for (let g of object.group) {
            EDITemplate.logger.log('group', g);
            let elements: (Element | AlternativeGroup)[] = [];
            let doingAlternativeGroup = false;
            let currentAlternativeGroup: AlternativeGroup = new AlternativeGroup();
            for (let e of g.element) {
                EDITemplate.logger.log('element', e);

                let temp: Element = new Element();
                temp.fromTemplateElement(e);
                EDITemplate.logger.log('created element', temp);
                if (!doingAlternativeGroup && e['_alternativeTo']) {
                    doingAlternativeGroup = true;
                    currentAlternativeGroup = new AlternativeGroup();
                    currentAlternativeGroup.id = e['_alternativeTo'];
                    currentAlternativeGroup.elements = [];
                }
                if (doingAlternativeGroup && !e['_alternativeTo']) {
                    doingAlternativeGroup = false;
                    elements.push(currentAlternativeGroup);
                }
                if (doingAlternativeGroup) {
                    temp.alternativeTo = currentAlternativeGroup.id;
                    currentAlternativeGroup.elements.push(temp);
                } else {
                    elements.push(temp);
                }
            }
            g.element = elements;
        }
        return object;
    }

    private inferVersion() {
        if (this.contents.settings.userInterfaceLanguage) {
            this.state.templateVersion = 2;
        } else {
            this.state.templateVersion = 1;
        }
        this.stateSubject.next(this.state);
    }

    private toEDIML() {

    }

    loadFromCatalogue(id: string): Observable<any> {
        this.loading = true;

        // this.state.templateName = filename;
        let headers = new Headers();
        headers.append('Accept', 'application/json');
        Endpoint.http = this.http;

        return this.catalogueService.getTemplate(id)
            .map((res: any) => {
                EDITemplate.logger.log('template from catalogue', res);
                this.contents = res;
                this.state.template = this.contents;

                this.importEndpointTypes();
                this.importDatasources();

                this.contents = this.fixGroupsElementsAndItems();

                EDITemplate.logger.log(1111111);
                this.fixDatasources();
                EDITemplate.logger.log(2222222);

                this.state.interfaceLanguage = this.contents.settings.userInterfaceLanguage['_xml:lang'];
                this.stateSubject.next(this.state);
                EDITemplate.logger.log('Contents: ', this.contents);
                this.loading = false;

                return this.contents;
            });
    }

    load(filename: string): Observable<any> {
        let results = new Subject();
        this.loading = true;

        this.path = filename;
        // this.state.templateName = filename;
        let headers = new HttpHeaders();
        headers.append('Accept', 'application/xml');
        Endpoint.http = this.http;

        this.http.get(filename, {
            headers: headers,
            responseType: 'text'
        })
            .subscribe(res => {
                this.state.originalTemplate = res;
                this.contents = this.x2js.xml2json(res).template;
                EDITemplate.logger.log('RAW template 1', this.x2js.xml2json(res));
                EDITemplate.logger.log('RAW template 2', this.contents);
                this.inferVersion();
                EDITemplate.logger.log('template version is ' + this.state.templateVersion);
                this.contents = this.fixArrays();
                this.contents = this.fixBooleans();
                // this.contents = this.fixGroupsElementsAndItems();

                try {
                    this.catalogueService.saveTemplate(this.contents);
                } catch (e) {
                    EDITemplate.logger.error(e);
                }

                this.state.template = this.contents;

                this.importEndpointTypes();
                this.importDatasources();

                this.contents = this.fixGroupsElementsAndItems();

                EDITemplate.logger.log(1111111);
                this.fixDatasources();
                EDITemplate.logger.log(2222222);

                this.state.interfaceLanguage = this.contents.settings.userInterfaceLanguage['_xml:lang'];
                this.stateSubject.next(this.state);
                EDITemplate.logger.log('Contents: ', this.contents);
                this.loading = false;

                results.next(this.contents);
            });
        return results;
    }
}
