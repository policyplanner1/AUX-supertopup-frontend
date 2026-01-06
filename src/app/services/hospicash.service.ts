import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of, Observable, from } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { db } from '../../firebaseConfig';
import { collection, addDoc } from 'firebase/firestore';

@Injectable({ providedIn: 'root' })
export class HospiCashService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getHospiCashEndpoints(): Observable<any> {
    const url = `${this.baseUrl}/companies/plans?policy=hc`;
    return this.http.get(url);
  }

  callAllPremiumApis(apiList: string[], payload: any) {
  const requests = apiList.map((apiRaw) => {
    // ✅ reveal hidden characters
    console.log("API raw:", JSON.stringify(apiRaw));

    const api = (apiRaw || "").trim();
    console.log("API trimmed:", JSON.stringify(api));

    const finalUrl =
      api.startsWith("http://") || api.startsWith("https://")
        ? api
        : api.startsWith("/")
          ? `${this.baseUrl}${api}`
          : `${this.baseUrl}/${api}`;

    console.log("FINAL URL:", JSON.stringify(finalUrl));

    return this.http.post(finalUrl, payload).pipe(
      catchError((err) => {
        console.warn(`⚠️ Skipping failed API: ${finalUrl}`, err?.message || err);
        return of(null);
      })
    );
  });

  return forkJoin(requests);
}


  saveHospiCashProposal(payload: any) {
    const apiCall = this.http.post(`${this.baseUrl}/proposals/save`, payload);

    const firebasePayload = {
      ...payload,
      lead_type: "hc", // ✅
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
