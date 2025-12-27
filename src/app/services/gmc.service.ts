import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, from } from 'rxjs';
import { environment } from '../../environments/environment';
import { db } from '../../firebaseConfig';
import { addDoc, collection } from 'firebase/firestore';

@Injectable({ providedIn: 'root' })
export class GMCService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /* -----------------------------
     GMC QUOTE ENDPOINTS (future)
  ----------------------------- */
  getGmcPlanEndpoints() {
    return this.http.get(`${this.baseUrl}/companies/plans?policy=gmc`);
  }

  /* -----------------------------
     SAVE GMC ENQUIRY (PA STYLE)
  ----------------------------- */
  saveGmcEnquiry(payload: any) {
    console.log('📤 GMC SERVICE PAYLOAD:', payload);

    const firebasePayload = {
      ...payload,
      lead_type: 'gmc',
      plan_type: 'gmc',
      source: 'sat-web',
      createdAt: new Date().toISOString(),
    };

    const firebaseCall = from(
      addDoc(collection(db, 'AUX_enquiry_leads'), firebasePayload)
    );

    return forkJoin({
      firebase: firebaseCall,
    });
  }
}
