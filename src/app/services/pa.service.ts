import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of, Observable, from } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { db } from '../../firebaseConfig';
import { collection, addDoc } from 'firebase/firestore';

@Injectable({ providedIn: 'root' })
export class PAService {
  private baseUrl = environment.apiUrl; // ✅ same as supertopup

  constructor(private http: HttpClient) {}

  getHealthPlanEndpoints(): Observable<any> {
    const url = `${this.baseUrl}/companies/plans?policy=pa`;
    return this.http.get(url);
  }

  callAllPremiumApis(apiList: string[], payload: any) {
    const requests = apiList.map(api =>
      this.http.post(`${api}`, payload).pipe(
        catchError(err => {
          console.warn(`⚠️ Skipping failed API: ${api}`, err?.message || err);
          return of(null);
        })
      )
    );
    return forkJoin(requests);
  }

  // ✅ EXACT same flow name + structure as SuperTopup
  saveHealthProposal(payload: any) {
    const apiCall = this.http.post(`${this.baseUrl}/proposals/save`, payload);

    const firebasePayload = {
      ...payload,
      lead_type: "pa", // ✅
      createdAt: new Date().toISOString(),
    };

    const firebaseCall = from(addDoc(collection(db, 'AUX_leads'), firebasePayload));

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
