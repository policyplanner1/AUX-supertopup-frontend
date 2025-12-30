import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of, Observable, from } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { db } from '../../firebaseConfig';
import { collection, addDoc } from 'firebase/firestore';

@Injectable({ providedIn: 'root' })
export class GMCService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getGMCEndpoints(): Observable<any> {
    const url = `${this.baseUrl}/companies/plans?policy=gmc`;
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

  saveGMCProposal(payload: any) {
    const apiCall = this.http.post(`${this.baseUrl}/proposals/save`, payload);

    const firebasePayload = {
      ...payload,
      lead_type: "gmc", // ✅
      createdAt: new Date().toISOString(),
    };

    const firebaseCall = from(addDoc(collection(db, 'AUX_leads'), firebasePayload));

    return forkJoin({
      api: apiCall,
      firebase: firebaseCall
    });
  }
}
