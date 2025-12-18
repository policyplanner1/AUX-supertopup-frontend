import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { forkJoin, of, Observable, throwError, from } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { db } from '../../firebaseConfig';
import { collection, addDoc } from 'firebase/firestore';

@Injectable({
  providedIn: 'root'
})
export class SuperTopupService {

  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

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

  saveHealthProposal(payload: any) {

    
    const apiCall = this.http.post(`${this.baseUrl}/proposals/save`, payload);

    const firebasePayload = {
      ...payload,
      lead_type: "super-top-up"
    };

    const firebaseCall = from(
      addDoc(collection(db, 'AUX_leads'), firebasePayload)
    );

    return forkJoin({
      api: apiCall,
      firebase: firebaseCall
    });
  }

sendOtp(mobile: string) {
  return this.http.post<any>(`${this.baseUrl}/otp/send-otp`, { mobile });
}

verifyOtp(mobile: string, otp: string) {
  return this.http.post<any>(`${this.baseUrl}/otp/verify-otp`, { mobile, otp });
}

}
