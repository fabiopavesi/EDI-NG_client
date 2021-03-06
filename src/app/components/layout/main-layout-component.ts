/**
 * Created by fabio on 02/03/2017.
 */

import {AfterViewInit, Component, ViewEncapsulation} from '@angular/core';
import {XML2JSON} from '../../utils/XML2JSON';
import {EDITemplate} from '../service/EDITemplate';
import {ITemplate, Template} from '../../model/Template';
import {State} from '../../model/State';
import {AlternativeGroup} from '../../model/AlternativeGroup';
import {MetadataService} from "../service/MetadataService";
import {ActivatedRoute} from '@angular/router';
import {CatalogueService} from '../service/catalogue.service';
import {EDIML} from '../../model/EDIML';
import {Item} from '../../model/Item';
import {BaseDatasource} from '../../model/Datasource';
import {Element} from '../../model/Element';

// const templateUrl = '../assets/RNDT_dataset_v4.00.xml';
// const templateUrl = 'assets/SensorML20_lightweight_v1.00_forLTER_newSchema.xml';
const templateUrl = 'assets/RNDT_dataset_v4.00_newFormat.xml';

@Component({
    selector: 'app-main-layout',
    templateUrl: './main-layout-component.html',
    styleUrls: ['./main-layout-component.scss'],
    providers: [EDITemplate],
    encapsulation: ViewEncapsulation.None
})
export class MainLayoutComponent implements AfterViewInit {
    templateName: string;
    title: string;
    template: Template;
    loading: boolean = true;
    interfaceLanguage: string = 'en';
    showDebug = false;

    setLanguage(lang: string) {
        this.metadataService.state.interfaceLanguage = lang;
    }

    isAlternativeGroup(e: any) {
        if (e instanceof AlternativeGroup) {
            return true;
        } else {
            return false;
        }
    }

    goTo(location: string): void {
        window.location.hash = location;
    }

    constructor(private route: ActivatedRoute, private EDITemplate: EDITemplate, public metadataService: MetadataService, private catalogueService: CatalogueService) {
        this.metadataService.state._interfaceLanguage.asObservable().subscribe(
            res => this.interfaceLanguage = res
        );
/*
        this.metadataService.state.queryParameters = this.route.snapshot.queryParams;
        console.log('queryParams', this.route.snapshot.queryParams);

        this.route.params.subscribe(params => {
            console.log('params', params)
            this.templateName = params['template'];
            this.template = new Template();
            this.metadataService.state.templateName = this.templateName;
            console.log('State is', this.metadataService.state.templateName);

            console.log('about to load template', templateUrl);
            this.EDITemplate.load('assets/templates/' + this.templateName)
                .subscribe((res) => {
                    this.template = res;
                    this.title = this.metadataService.state.templateName;
                    if ( this.route.snapshot.queryParams['edit'] ) {
                        let id = this.route.snapshot.queryParams['edit'];
                        this.catalogueService.getEDIML(id)
                            .subscribe( res => {
                                console.log('loaded EDIML', id, res);
                                this.metadataService.state.mergeWithEDIML(res);
                                console.log('merged with EDIML', id, this.metadataService.state.template);
                                this.catalogueService.setId(id);
                                console.log('Loading EDIML', 'CatalogueId', this.catalogueService.getCatalogueMetadatumURL());
                                this.loading = false;
                                console.log('Template loaded: ', res);
                            })
                    } else {
                        this.loading = false;
                        console.log('Template loaded: ', res);
                    }
                });
        });
*/
    }

    ngAfterViewInit() {
        EDIML.metadataService = this.metadataService;
        Item.metadataService = this.metadataService;
        Element.metadataService = this.metadataService;
        BaseDatasource.metadataService = this.metadataService;
    }
}
