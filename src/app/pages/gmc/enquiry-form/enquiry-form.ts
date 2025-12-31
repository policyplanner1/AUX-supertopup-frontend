import { Component, signal, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, ValidationErrors, FormBuilder, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';

// Import the city-to-zone mapping JSON file
import * as CITY_ZONE_MAP from '../../../../../city-zone-map.json';

@Component({
  selector: 'app-gmc-enquiry',
  standalone: true,
  templateUrl: './enquiry-form.html',
  styleUrls: ['./enquiry-form.scss'],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
})
export class GMCEnquiryFormComponent {
  today: Date = new Date();
  enquiryForm: FormGroup;

  // The CITY_ZONE_MAP now comes from the imported JSON file
  CITY_ZONE_MAP: { [key: string]: number } = CITY_ZONE_MAP;
  cities: string[] = Object.keys(this.CITY_ZONE_MAP);

  private readonly ENQUIRY_KEY = 'gmc_enquiry';
  private readonly RESTORE_FLAG = 'gmc_enquiry_restore_ok';
  private readonly PAGE_KEY = 'gmc_last_page';
  private readonly PAGE_NAME = 'gmc-enquiry-form';
  private readonly LANDING_URL = 'https://policyplanner.com#/';

  termsAcceptedSignal: WritableSignal<boolean> = signal(false);

  onTermsChange(event: Event) {
    this.termsAcceptedSignal.set((event.target as HTMLInputElement).checked);
  }

  private readonly EMAIL_REGEX =
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

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
      zone: ['3', Validators.required],
      zoneLabel: ['Zone 3'],
      coverageAmount: ['', Validators.required],
      demography: ['', Validators.required],
      dateOfBirth: ['', [Validators.required, this.dateOfBirthValidator.bind(this)]],
    });

    this.toUpperCaseControl('companyName');
    this.toUpperCaseControl('industryType');
    this.toUpperCaseControl('city');
  }

ngOnInit(): void {
  // Check if the form data should be restored
  const restoreFlag = sessionStorage.getItem(this.RESTORE_FLAG);

  // If the form is being restored (coming from the quotes page), restore the data
  if (restoreFlag === '1') {
    const savedData = localStorage.getItem(this.ENQUIRY_KEY);

    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);

        // Set the form fields with the saved data
        this.enquiryForm.patchValue({
          companyName: parsed.details.companyName,
          contactPerson: parsed.details.contactPerson,
          contactNumber: parsed.details.cust_mobile,
          email: parsed.details.email,
          companySize: parsed.details.companySize,
          industryType: parsed.details.industryType,
          city: parsed.details.cust_city,
          zone: parsed.details.zone,
          zoneLabel: parsed.details.zoneLabel,
          coverageAmount: parsed.details.cover_amount,
          demography: parsed.details.demography,
          dateOfBirth: parsed.details.dateOfBirth,
        });

        // Set the termsAcceptedSignal if it's part of the saved data
        this.termsAcceptedSignal.set(parsed.details.termsAccepted);

        console.log("Restored form data from localStorage:", parsed);
      } catch (e) {
        console.warn('Failed to parse localStorage data', e);
      }
    }

    // Reset the restore flag in sessionStorage after restoration
    sessionStorage.removeItem(this.RESTORE_FLAG);
  } else {
    // Clear form fields if not restoring
    this.enquiryForm.reset();
  }

  // Subscribe to the 'city' field's value changes
  this.enquiryForm.get('city')?.valueChanges.subscribe((city) => {
    console.log('Selected city:', city);
    this.updateZoneForCity(city);
  });

  // Also validate date of birth on form changes
  this.enquiryForm.get('dateOfBirth')?.valueChanges.subscribe((dob) => {
    console.log('Date of Birth changed:', dob);
    if (dob) {
      this.validateDateOfBirth(dob);
    }
  });
}


  private dateOfBirthValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;

    if (!value) {
      return null;
    }

    // Check if it's a valid date format (yyyy-MM-dd)
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(value)) {
      return { invalidFormat: 'Date must be in YYYY-MM-DD format' };
    }

    const dob = new Date(value);
    const today = new Date();

    // Check if date is valid
    if (isNaN(dob.getTime())) {
      return { invalidDate: 'Please enter a valid date' };
    }

    // Check if date is in the future
    if (dob > today) {
      return { futureDate: 'Date of birth cannot be in the future' };
    }

    // Check minimum age (18 years)
    const minAgeDate = new Date();
    minAgeDate.setFullYear(minAgeDate.getFullYear() - 18);

    if (dob > minAgeDate) {
      return { underage: 'You must be at least 18 years old' };
    }

    // Check maximum reasonable age (e.g., 100 years)
    const maxAgeDate = new Date();
    maxAgeDate.setFullYear(maxAgeDate.getFullYear() - 100);

    if (dob < maxAgeDate) {
      return { tooOld: 'Please enter a valid date of birth' };
    }

    // Additional check for year 0001 issue
    if (dob.getFullYear() < 1900) {
      return { invalidYear: 'Please enter a year after 1900' };
    }

    return null;
  }

  private validateDateOfBirth(dobString: string): void {
    const dob = new Date(dobString);
  }

  private updateZoneForCity(city: string) {
    const zone = this.CITY_ZONE_MAP[city.toLowerCase()];

    if (zone) {
      this.enquiryForm.patchValue({
        zone: zone,
        zoneLabel: `Zone ${zone}`,
      });
    } else {
      this.enquiryForm.patchValue({
        zone: '',
        zoneLabel: 'Zone not available',
      });
    }
  }

  private toUpperCaseControl(controlName: string) {
    const control = this.enquiryForm.get(controlName);
    if (!control) return;

    control.valueChanges.subscribe((value) => {
      if (typeof value === 'string') {
        const upper = value.toUpperCase();
        if (value !== upper) {
          control.setValue(upper, { emitEvent: false });
        }
      }
    });
  }

  allowOnlyLetters(event: KeyboardEvent) {
    const charCode = event.which || event.keyCode;
    const char = String.fromCharCode(charCode);

    if (!/^[a-zA-Z ]$/.test(char)) {
      event.preventDefault();
    }
  }

  allowOnlyNumbers(event: KeyboardEvent) {
    const charCode = event.which || event.keyCode;

    if (charCode < 48 || charCode > 57) {
      event.preventDefault();
    }
  }

  private calculateAge(dob: string): number | null {
    if (!dob) return null;

    const dobDate = new Date(dob);
    if (isNaN(dobDate.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - dobDate.getFullYear();
    const monthDiff = today.getMonth() - dobDate.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < dobDate.getDate())
    ) {
      age--;
    }

    return age;
  }

  private getDemographyCounts(demography: string): {
    noOfAdults: number;
    noOfChildren: number;
  } {
    switch (demography) {
      case 'employee':
        return { noOfAdults: 1, noOfChildren: 0 };
      case 'employee+spouse':
        return { noOfAdults: 2, noOfChildren: 0 };
      case 'spouse+2kids':
        return { noOfAdults: 2, noOfChildren: 2 };
      case 'withParents':
        return { noOfAdults: 4, noOfChildren: 2 };
      default:
        return { noOfAdults: 1, noOfChildren: 0 };
    }
  }

  goBack() {
    window.location.href = this.LANDING_URL;
  }

  isInvalid(field: string): boolean {
    const control = this.enquiryForm.get(field);
    return !!control && control.invalid && control.touched;
  }

  getDateOfBirthError(): string {
    const control = this.enquiryForm.get('dateOfBirth');
    if (!control || !control.errors) return '';

    const errors = control.errors;

    if (errors['required']) return 'Date of birth is required';
    if (errors['invalidFormat']) return errors['invalidFormat'];
    if (errors['invalidDate']) return errors['invalidDate'];
    if (errors['futureDate']) return errors['futureDate'];
    if (errors['underage']) return errors['underage'];
    if (errors['tooOld']) return errors['tooOld'];
    if (errors['invalidYear']) return errors['invalidYear'];

    return 'Please select a valid date of birth';
  }

  async submit() {
    if (this.enquiryForm.invalid || !this.termsAcceptedSignal()) {
      this.enquiryForm.markAllAsTouched();

      Object.keys(this.enquiryForm.controls).forEach(key => {
        const control = this.enquiryForm.get(key);
        if (control?.invalid) {
          console.log(`Field ${key} errors:`, control.errors);
        }
      });

      return;
    }

    const payload = this.buildPayload();
    console.log('🧾 GMC FORM RAW VALUE:', this.enquiryForm.getRawValue());
    console.log('🧾 GMC PAYLOAD:', payload);

    // Store in localStorage WITH ZONE
    localStorage.setItem(this.ENQUIRY_KEY, JSON.stringify(payload));
    sessionStorage.setItem(this.RESTORE_FLAG, '1');

    const d = payload.details;

    const leadDoc: any = {
      company_name: d.companyName,
      contact_person: d.contactPerson,
      cust_mobile: d.cust_mobile,
      email: d.email,
      company_size: d.companySize,
      industry_type: d.industryType,
      cust_city: d.cust_city,
      cover_amount: d.cover_amount,
      demography: d.demography,
      date_of_birth: d.dateOfBirth,
      Age: d.Age,
      no_of_adults: d.noOfAdults,
      no_of_children: d.noOfChildren,
      lead_type: 'group-medical-care',
      plan_type: 'gmc',
      created_at: new Date().toISOString(),
    };

    try {
      await addDoc(collection(db, 'AUX_enquiry_leads'), leadDoc);
      console.log('🔥 GMC Lead saved successfully');
    } catch (err) {
      console.error('❌ GMC Firebase save error', err);
    }

    this.router.navigateByUrl('/gmc/quotes');
  }

  private buildPayload() {
    const raw = this.enquiryForm.getRawValue();
    const age = this.calculateAge(raw.dateOfBirth);
    const { noOfAdults, noOfChildren } = this.getDemographyCounts(raw.demography);

    return {
      step: 1,
      details: {
        companyName: raw.companyName,
        contactPerson: raw.contactPerson,
        cust_mobile: raw.contactNumber,
        email: raw.email,
        companySize: raw.companySize,
        industryType: raw.industryType,
        cust_city: raw.city,
        zone: raw.zone,  // Added zone to payload
        cover_amount: raw.coverageAmount,
        demography: raw.demography,
        dateOfBirth: raw.dateOfBirth,
        Age: age,
        noOfAdults: noOfAdults,
        noOfChildren: noOfChildren,
        termsAccepted: this.termsAcceptedSignal(),
      },
    };
  }
}
