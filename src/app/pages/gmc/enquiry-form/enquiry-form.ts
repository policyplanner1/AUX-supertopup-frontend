import { Component, signal, WritableSignal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';

@Component({
  selector: 'app-gmc-enquiry',
  standalone: true,
  templateUrl: './enquiry-form.html',
  styleUrls: ['./enquiry-form.scss'],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
})
export class GMCEnquiryFormComponent {
  enquiryForm: FormGroup;

  private readonly ENQUIRY_KEY = 'gmc_enquiry';
  private readonly RESTORE_FLAG = 'gmc_enquiry_restore_ok';
  private readonly PAGE_KEY = 'gmc_last_page';
  private readonly PAGE_NAME = 'gmc-enquiry-form';
  private readonly LANDING_URL = 'https://policyplanner.com/#/';

  termsAcceptedSignal: WritableSignal<boolean> = signal(false);

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.enquiryForm = this.fb.group({
      companyName: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.pattern(/^[A-Z0-9 .&()-]+$/),
        ],
      ],
      contactPerson: ['', Validators.required],
     contactNumber: [
          '',
          [
            Validators.required,
            Validators.pattern(/^[6-9]\d{9}$/),
          ],
        ],

      email: [
        '',
        [
          Validators.required,
          Validators.pattern(this.EMAIL_REGEX),
        ],
      ],
      companySize: ['', Validators.required],
      industryType: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.pattern(/^[A-Z .&()-]+$/),
        ],
      ],
      city: [
          '',
          [
            Validators.required,
            Validators.minLength(2),
            Validators.pattern(/^[A-Z ]+$/),
          ],
        ],

      coverageAmount: ['', Validators.required],
      demography: ['', Validators.required],
    });

  this.toUpperCaseControl('companyName');
  this.toUpperCaseControl('industryType');
  this.toUpperCaseControl('city');
  }

  allowOnlyLetters(event: KeyboardEvent) {
  const charCode = event.which || event.keyCode;
  const char = String.fromCharCode(charCode);

  // Allow A–Z, a–z and space
  if (!/^[a-zA-Z ]$/.test(char)) {
    event.preventDefault();
  }
}

allowOnlyNumbers(event: KeyboardEvent) {
  const charCode = event.which || event.keyCode;

  // Allow only digits 0–9
  if (charCode < 48 || charCode > 57) {
    event.preventDefault();
  }
}

  /* ------------------------------------
   🔁 PA-STYLE RESTORE LOGIC
  ------------------------------------ */
  ngOnInit(): void {
    sessionStorage.setItem(this.PAGE_KEY, this.PAGE_NAME);

    const restoreAllowed =
      sessionStorage.getItem(this.RESTORE_FLAG) === '1';
    const saved = localStorage.getItem(this.ENQUIRY_KEY);

    if (restoreAllowed && saved) {
      this.restoreFromLocal();
    }
  }

  /* ------------------------------------
   🔙 BACK ICON (SAME AS PA)
  ------------------------------------ */
  @HostListener('window:popstate', ['$event'])
  onBrowserBack(event: PopStateEvent) {
    event.preventDefault();
    window.location.href = this.LANDING_URL;
  }

  goBack() {
    window.location.href = this.LANDING_URL;
  }


  /* ------------------------------------
   ✅ VALIDATION
  ------------------------------------ */
  isInvalid(field: string): boolean {
    const control = this.enquiryForm.get(field);
    return !!control && control.invalid && control.touched;
  }

  /* ------------------------------------
   📦 BUILD GMC PAYLOAD (LOCAL + FIREBASE)
  ------------------------------------ */
  private buildPayload() {
    const raw = this.enquiryForm.getRawValue();

    return {
      step: 1,
      details: {
        companyName: raw.companyName,
        contactPerson: raw.contactPerson,
        contactNumber: raw.contactNumber,
        email: raw.email,
        companySize: raw.companySize,
        industryType: raw.industryType,
        city: raw.city,
        coverageAmount: raw.coverageAmount,
        demography: raw.demography,
        termsAccepted: this.termsAcceptedSignal(),
      },
    };
  }

  private toUpperCaseControl(controlName: string) {
  const control = this.enquiryForm.get(controlName);
  if (!control) return;

  control.valueChanges.subscribe(value => {
    if (typeof value === 'string') {
      const upper = value.toUpperCase();
      if (value !== upper) {
        control.setValue(upper, { emitEvent: false });
      }
    }
  });
}


  /* ------------------------------------
   🔄 RESTORE FROM LOCALSTORAGE
  ------------------------------------ */
  private restoreFromLocal(): void {
    try {
      const raw = localStorage.getItem(this.ENQUIRY_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      const d = parsed?.details ?? {};

      this.enquiryForm.patchValue(
        {
          companyName: d.companyName || '',
          contactPerson: d.contactPerson || '',
          contactNumber: d.contactNumber || '',
          email: d.email || '',
          companySize: d.companySize || '',
          industryType: d.industryType || '',
          city: d.city || '',
          coverageAmount: d.coverageAmount || '',
          demography: d.demography || '',
        },
        { emitEvent: false }
      );

      this.termsAcceptedSignal.set(!!d.termsAccepted);
    } catch {
      // silent fail (same as PA)
    }
  }

  private readonly EMAIL_REGEX =
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  /* ------------------------------------
   🚀 SUBMIT (SAVE → FIREBASE → QUOTES)
  ------------------------------------ */
  async submit() {
    if (this.enquiryForm.invalid || !this.termsAcceptedSignal()) {
      this.enquiryForm.markAllAsTouched();
      return;
    }

    /* 1️⃣ Save to localStorage (PA style) */
    const payload = this.buildPayload();
    console.log('🧾 GMC FORM RAW VALUE:', this.enquiryForm.getRawValue());
    console.log('🧾 GMC PAYLOAD (LOCAL + FIREBASE):', payload);

    localStorage.setItem(this.ENQUIRY_KEY, JSON.stringify(payload));

    /* allow restore when coming back from quotes */
    sessionStorage.setItem(this.RESTORE_FLAG, '1');

    /* 2️⃣ FIREBASE LEAD SAVE (PA-STYLE NAMING) */
    const d = payload.details;

    const leadDoc: any = {
      // aliases (consistent naming)
      company_name: d.companyName,
      contact_person: d.contactPerson,
      contact_number: d.contactNumber,
      email: d.email,
      company_size: d.companySize,
      industry_type: d.industryType,
      city: d.city,
      coverage_amount: d.coverageAmount,
      demography: d.demography,

      // identifiers
      lead_type: 'group-medical-care',
      plan_type: 'gmc',
      source: 'sat-web',

      created_at: new Date().toISOString(),
    };

      console.log('🔥 GMC FIREBASE PAYLOAD:', leadDoc);

    try {
      await addDoc(collection(db, 'AUX_enquiry_leads'), leadDoc);
      console.log('🔥 GMC Lead saved successfully');
    } catch (err) {
      console.error('❌ GMC Firebase save error', err);
    }

    /* 3️⃣ NAVIGATE TO QUOTES */
    this.router.navigateByUrl('/gmc/quotes');
  }
}
