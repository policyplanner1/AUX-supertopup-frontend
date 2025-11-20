import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { forkJoin, of, Observable, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class SuperTopupService {

  private baseUrl = 'http://localhost:1202';  // your backend base URL
// private baseUrl = 'https://policyplanner.com/health-insurance/';


  constructor(private http: HttpClient) {}

   /** ✅ Step 1: Get all available health plan endpoints */
  getHealthPlanEndpoints(): Observable<any> {
    const url = `${this.baseUrl}/companies/plans?policy=super_top_up`;
    return this.http.get(url);
  }

  /** ✅ Step 2: Call each premium API with same payload */
  callAllPremiumApis(apiList: string[], payload: any) {
    const requests = apiList.map(api =>
      this.http.post(`${api}`, payload).pipe(
        catchError(err => {
          console.warn(`⚠️ Skipping failed API: ${api}`, err.message || err);
          return of(null); // return null for failed requests
        })
      )
    );
        return forkJoin(requests);

  }

}
