import {EndpointType, HTTPMethod, ContentTypes} from './EndpointType';
import {Http, RequestOptionsArgs, Headers, Response, RequestOptions, BaseRequestOptions} from '@angular/http';
import {Logger, availableContexts} from '../utils/logger';
import {Observable, BehaviorSubject} from 'rxjs';
import {Injectable, Inject, ReflectiveInjector, Injector} from '@angular/core';

// Import RxJs required methods
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/catch';
import {HttpClient, HttpHeaders} from '@angular/common/http';

/**
 * Created by fabio on 08/03/2017.
 */

@Injectable()
export class Endpoint {
    static logger = new Logger(availableContexts.ENDPOINT);
    static endpoints: Endpoint[] = [];
    static http: HttpClient;
    private endpointType: EndpointType;
    private url: string;
    private logger: Logger = new Logger(availableContexts.ENDPOINT);

    static find(endpointType: EndpointType, url: string): Endpoint {
        for (let e of Endpoint.endpoints) {
            if (e.endpointType === endpointType && e.url === url) {
                return e;
            }
        }
        return new Endpoint(endpointType, url);
    }

    constructor(endpointType: EndpointType, url: string) {
        this.endpointType = endpointType;
        this.url = url;

        Endpoint.endpoints.push(this);
    }

    query(query: string): Observable<any[]> {
        let result: BehaviorSubject<any[]> = new BehaviorSubject([]);
        switch (this.endpointType.method) {
            case HTTPMethod.GET:
                let qs: string;
                qs = this.url + (this.url.indexOf('?') >= 0 ? '&' : '?');
                for (let p of this.endpointType.parameters) {
                    qs += encodeURIComponent(p.name) + '=' + encodeURIComponent(p.value) + '&';
                }
                let headers: HttpHeaders = new HttpHeaders({
                    'Accept': this.endpointType.contentType || 'application/sparql-results+json; charset=utf-8, application/json; charset=utf-8'/*,
                    'Content-type': this.endpointType.contentType*/
                });

                qs += encodeURIComponent(this.endpointType.queryParameter) + '=' + encodeURIComponent(query);
                // let options: HttpHeaders = headers;

                // Endpoint.logger.log('HTTP GET', this.endpointType, this.endpointType.contentType);
                Endpoint.http
                    .get(qs, {
                        headers: headers
                    })
                    .subscribe((res: any) => {
                            Endpoint.logger.log('Res: ', res, query);
                            if (this.endpointType.contentType === ContentTypes.JSON ||
                                this.endpointType.contentType === ContentTypes.sparqlJSON ||
                                this.endpointType.contentType === ContentTypes.sparqlJSONP) {
                            }
                            result.next(this.endpointType.adapter(res));
                        },
                        err => {
                            Endpoint.logger.log(err);
                        });
                /*
                                    // .catch((error: any) => Observable.throw(error || 'Server error'));
                                    .subscribe(
                                        res => {
                                            Endpoint.logger.log('endpoint query results', res);
                                            result.next(res);
                                        },
                                        err => {
                                            Endpoint.logger.log(err);
                                        }
                                    )
                */

                break;
            case HTTPMethod.POST:
                this.logger.error('POST is not implemented yet');
                break;
            default:
                this.logger.error(this.endpointType.method + ' is not implemented yet');
        }
        return result.asObservable();
    }

}
