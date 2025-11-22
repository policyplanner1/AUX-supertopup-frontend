import { Component, OnInit, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SuperTopupService } from '../../../services/super-topup.service';

@Component({
  selector: 'app-proposal-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './proposal-form.html',
  styleUrl: './proposal-form.scss',
})
export class ProposalForm implements OnInit {

  /* -----------------------------------------
        BASIC
  ----------------------------------------- */
  currentStep: number = 1;
  today: string = new Date().toISOString().split('T')[0];
  minAdultDate: string = '';

  fieldErrors: any = {};
  popupOpen: boolean = false;
  step2Error: string = '';
    selectedPlan: any = null;


  /* -----------------------------------------
          MAIN MODEL
  ----------------------------------------- */
  proposalData: any = {
    productName: '',
    selectedProductType: 'new',
    pincode: '',
    cityState: '',
    zone: '',
    upgradeZone: 'no',

    proposerName: '',
    proposerDOB: '',
    proposerGender: '',
    proposerPhone: '',
    proposerEmail: '',
    sumInsured: '',
    selectedTenure: 1,

    annualIncome: '5-8',
    nriDiscount: 'no',
    includeSelf: 'yes',
    bureauDiscount: 'no',

    aadharNumber: '',
    panNumber: '',
  };

  /* -----------------------------------------
          MEMBERS
  ----------------------------------------- */
  adults: any[] = [];
  children: any[] = [];

  diseaseList: string[] = [
    'Diabetes',
    'Hypertension',
    'Thyroid',
    'Heart Disease',
    'Asthma',
    'Arthritis',
    'Cancer',
    'Kidney Disease'
  ];

constructor(
  private eRef: ElementRef,
  private api: SuperTopupService
) {}


  /* -----------------------------------------
          INIT
  ----------------------------------------- */
  ngOnInit(): void {
    this.initializeAdults();

    this.selectedPlan = (history.state as any)?.selectedPlan || null;
    console.log("plans history",this.selectedPlan)
        if (this.selectedPlan) {
      const companyName =
        this.selectedPlan?.company?.company_name ||
        this.selectedPlan?.tag ||
        '';

        // Calculate minimum DOB (18 years old)
            const today = new Date();
            const adultYear = today.getFullYear() - 18;
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');

            this.minAdultDate = `${adultYear}-${month}-${day}`;

      const planName =
        this.selectedPlan?.planName ||
        this.selectedPlan?.name ||
        '';
      this.proposalData.aadharNumber = '';
      this.proposalData.productName = `${companyName} ${planName}`.trim();
    }

    // Load from localStorage
    const saved = localStorage.getItem("supertopup_enquiry");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        const details = data.details || {};

        this.proposalData.proposerName = `${details.firstName || ''} ${details.lastName || ''}`.trim();
        this.proposalData.proposerGender = details.gender || '';
        this.proposalData.proposerPhone = details.mobile || '';
        this.proposalData.pincode = details.pincode || '';
        this.proposalData.cityState = details.city || '';
        this.proposalData.sumInsured = details.coverAmount || '';

        // if (data.members && data.members.length > 0) {
        //   const member = data.members[0];
        //   if (member.age) {
        //     const year = new Date().getFullYear() - Number(member.age);
        //     this.proposalData.proposerDOB = `${year}-01-01`;
        //   }
        // }
          this.proposalData.proposerDOB = '';
      } catch (e) {
        console.error('Failed to parse localStorage supertopup_enquiry', e);
      }
    }

    // Load selected product
    const selectedProduct = localStorage.getItem("selectedProductName");
    const selectedProductData = localStorage.getItem("selectedProductData");

    if (selectedProduct) {
      this.proposalData.productName = selectedProduct;
    }

    if (selectedProductData) {
      try {
        const productData = JSON.parse(selectedProductData);
        if (productData.coverAmount) {
          this.proposalData.sumInsured = productData.coverAmount;
        }
        if (productData.zone) this.proposalData.zone = productData.zone;
      } catch (e) {
        console.error('Failed to parse selected product data', e);
      }
    }

    this.disableAutoFields();
  }

  /* -----------------------------------------
          UTILITY FUNCTIONS
  ----------------------------------------- */
  goBack() {
    window.history.back();
  }

  disableAutoFields() {
    setTimeout(() => {
      const ids = ["nameField", "pincodeField", "phoneField", "tenureField", "sumInsuredField", "productField", "cityField"];
      ids.forEach(id => {
        const el = document.getElementById(id) as HTMLInputElement;
        if (el) {
          el.readOnly = true;
          el.style.backgroundColor = "#f1f1f1";
        }
      });
    }, 200);
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'Not Provided';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN');
  }

  getIncomeRangeText(incomeRange: string): string {
    const ranges: { [key: string]: string } = {
      '3-5': '₹3 Lakh – ₹5 Lakh',
      '5-8': '₹5 Lakh – ₹8 Lakh',
      '8-12': '₹8 Lakh – ₹12 Lakh',
      '12-18': '₹12 Lakh – ₹18 Lakh',
      '18-25': '₹18 Lakh – ₹25 Lakh',
      '25-40': '₹25 Lakh – ₹40 Lakh',
      '40+': '₹40 Lakh and Above'
    };
    return ranges[incomeRange] || 'Not Provided';
  }

  /* -----------------------------------------
          MEMBER MANAGEMENT
  ----------------------------------------- */
  initializeAdults() {
    this.adults = [
      {
        relationship: 'Self',
        title: 'Mr',
        fullName: '',
        dob: '',
        height: '',
        weight: '',
        abhaId: '',
        memberIdProof: 'Aadhaar',
        dropdownOpen: false,
        selectedDiseases: [],
        errors: {}
      }
    ];
  }
  sanitizeAadhaar(value: string): string {
  return value ? value.replace(/[^0-9]/g, '') : '';
}

  initializeChildren(count: number) {
    this.children = Array(count).fill(null).map(() => ({
      relationship: 'Son',
      title: 'Master',
      fullName: '',
      dob: '',
      height: '',
      weight: '',
      abhaId: '',
      memberIdProof: 'BirthCertificate',
      dropdownOpen: false,
      selectedDiseases: [],
      errors: {}
    }));
  }

  get isDobValid() {
  return !this.fieldErrors.proposerDOB && this.proposalData.proposerDOB;
}

get isDobInvalid() {
  return !!this.fieldErrors.proposerDOB;
}

  get isAadharFieldValid() {
  return !this.fieldErrors.aadharNumber && (this.proposalData.aadharNumber?.length > 0);
}

get isAadharFieldInvalid() {
  return !!this.fieldErrors.aadharNumber;
}

get isPanFieldValid() {
  return !this.fieldErrors.panNumber && (this.proposalData.panNumber?.length > 0);
}

get isPanFieldInvalid() {
  return !!this.fieldErrors.panNumber;
}

  get adultCount(): number {
    return this.adults.length;
  }

  get childCount(): number {
    return this.children.length;
  }

  changeAdultCount(delta: number) {
    const newCount = Math.max(1, Math.min(6, this.adultCount + delta));
    if (newCount > this.adultCount) {
      this.adults.push({
        relationship: 'Spouse',
        title: 'Mrs',
        fullName: '',
        dob: '',
        height: '',
        weight: '',
        abhaId: '',
        memberIdProof: 'Aadhaar',
        dropdownOpen: false,
        selectedDiseases: [],
        errors: {}
      });
    } else if (newCount < this.adultCount) {
      this.adults.pop();
    }
  }

  changeChildCount(delta: number) {
    const newCount = Math.max(0, Math.min(6, this.childCount + delta));
    this.initializeChildren(newCount);
  }

  /* -----------------------------------------
          VALIDATION FUNCTIONS
  ----------------------------------------- */
  // FIXED: This method now properly returns only boolean
  isValid(field: string): boolean {
    const value = this.proposalData[field];

    switch (field) {
      case 'productName': return !!value;
      case 'selectedProductType': return !!value;
      case 'pincode': return this.isPincodeValid(value);
      case 'cityState': return !!value;
      case 'proposerName': return this.isNameValid(value);
      case 'proposerDOB': return this.isDOBValid(value);
      case 'proposerGender': return !!value;
      case 'proposerPhone': return this.isPhoneValid(value);
      case 'proposerEmail': return this.isEmailValid(value);
      case 'sumInsured': return !!value;
      case 'selectedTenure': return !!value;
      case 'aadharNumber': return this.isAadhaarValid(value);
      case 'panNumber': return this.isPanValid(value);
      default: return !!value;
    }
  }

  // FIXED: This method now properly returns only boolean
  isMemberValid(member: any, field: string): boolean {
    const value = member[field];

    switch (field) {
      case 'fullName': return this.isNameValid(value);
      case 'dob': return this.isDOBValid(value);
      case 'height': return this.isHeightValid(value);
      case 'weight': return this.isWeightValid(value);
      case 'relationship': return !!value;
      case 'title': return !!value;
      default: return !!value;
    }
  }

  validateMember(member: any) {
    member.errors = {};

    if (!this.isNameValid(member.fullName)) {
      member.errors.fullName = 'Enter valid name (alphabets only)';
    }

    if (!this.isDOBValid(member.dob)) {
      member.errors.dob = 'Enter valid date of birth';
    }

    if (!this.isHeightValid(member.height)) {
      member.errors.height = 'Height must be between 50-250 cm';
    }

    if (!this.isWeightValid(member.weight)) {
      member.errors.weight = 'Weight must be between 10-250 kg';
    }
  }

  // Individual validation methods - all return boolean only
  isPincodeValid(v: string): boolean {
    return /^[1-9][0-9]{5}$/.test(v);
  }

  isNameValid(v: string): boolean {
    return !!(v && /^[A-Za-z ]+$/.test(v) && v.length >= 2);
  }

  isDOBValid(v: string): boolean {
    if (!v) return false;
    const dob = new Date(v);
    const today = new Date();
    return dob < today;
  }

  isEmailValid(v: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  isPhoneValid(v: string): boolean {
    return /^[6-9]\d{9}$/.test(v);
  }

  isAadhaarValid(v: string): boolean {
    return /^[2-9]{1}[0-9]{11}$/.test(v);
  }

  isPanValid(v: string): boolean {
    return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v);
  }

  isHeightValid(v: string): boolean {
    const num = Number(v);
    return !isNaN(num) && num >= 50 && num <= 250;
  }

  isWeightValid(v: string): boolean {
    const num = Number(v);
    return !isNaN(num) && num >= 10 && num <= 250;
  }

  /* -----------------------------------------
          FIELD VALIDATION METHODS
  ----------------------------------------- */
validateDOB() {
  const dob = this.proposalData.proposerDOB;

  if (!dob) {
    this.fieldErrors.proposerDOB = "Date of birth is required";
    return;
  }

  const birthDate = new Date(dob);
  const today = new Date();

  // Must not be in future
  if (birthDate > today) {
    this.fieldErrors.proposerDOB = "Date of birth cannot be in the future";
    return;
  }

  // Must be at least 18 years old
  const age = today.getFullYear() - birthDate.getFullYear();
  const hasBirthdayPassed =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
     today.getDate() >= birthDate.getDate());

  const realAge = hasBirthdayPassed ? age : age - 1;

  if (realAge < 18) {
    this.fieldErrors.proposerDOB = "Proposer must be at least 18 years old";
  } else {
    delete this.fieldErrors.proposerDOB;
  }
}


  validateEmail() {
    const email = this.proposalData.proposerEmail?.trim() || '';
    if (!email) {
      this.fieldErrors.proposerEmail = "Email is required";
    } else if (!this.isEmailValid(email)) {
      this.fieldErrors.proposerEmail = "Enter a valid email address";
    } else {
      delete this.fieldErrors.proposerEmail;
    }
  }

validateAadhaar() {
  const aadhaar = this.proposalData.aadharNumber || '';
  if (!aadhaar) {
    this.fieldErrors.aadharNumber = "Aadhaar number is required";
  } else if (!this.isAadhaarValid(aadhaar)) {
    this.fieldErrors.aadharNumber = "Enter valid 12-digit Aadhaar number";
  } else {
    delete this.fieldErrors.aadharNumber;
  }
}

validatePan() {
  const pan = this.proposalData.panNumber || '';
  if (!pan) {
    this.fieldErrors.panNumber = "PAN number is required";
  } else if (!this.isPanValid(pan)) {
    this.fieldErrors.panNumber = "Enter valid PAN format (ABCDE1234F)";
  } else {
    delete this.fieldErrors.panNumber;
  }
}

  /* -----------------------------------------
          INPUT HANDLING
  ----------------------------------------- */
allowAadhaarInput(event: any) {
  const key = event.key;

  // Allow control keys
  if (
    key === 'Backspace' ||
    key === 'Delete' ||
    key === 'Tab' ||
    key === 'ArrowLeft' ||
    key === 'ArrowRight' ||
    key === 'Home' ||
    key === 'End'
  ) {
    return;
  }

  // Android keyboards sometimes return full words or alphabets
  // So block EVERYTHING except digits 0–9
  if (!/^[0-9]$/.test(key)) {
    event.preventDefault();
  }
}


  blockNonDigits(event: KeyboardEvent) {
    if (['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return;
    }
    if (!/[0-9]/.test(event.key)) {
      event.preventDefault();
    }
  }

  onPanChange() {
    this.proposalData.panNumber = (this.proposalData.panNumber || '').toUpperCase();
  }

  /* -----------------------------------------
          DROPDOWN + DISEASE LOGIC
  ----------------------------------------- */
toggleDropdown(member: any) {
  // do not open if already locked
  if (member.diseaseLocked) {
    return;
  }
  member.dropdownOpen = !member.dropdownOpen;
}

private lockDisease(member: any) {
  member.diseaseLocked = true;       // 🔒 lock further changes
  member.dropdownOpen = false;       // close dropdown
}

selectNone(member: any, event?: MouseEvent) {
  event?.stopPropagation();

  if (!member.selectedDiseases) {
    member.selectedDiseases = [];
  }

  if (member.selectedDiseases.includes('None of these')) {
    member.selectedDiseases = [];
  } else {
    member.selectedDiseases = ['None of these'];
    this.lockDisease(member);       // lock once selected
  }
}
  toggleDisease(member: any, disease: string, event?: MouseEvent) {
  event?.stopPropagation();

  if (!member.selectedDiseases) {
    member.selectedDiseases = [];
  }

  const idx = member.selectedDiseases.indexOf(disease);

  if (idx > -1) {
    member.selectedDiseases.splice(idx, 1);
  } else {
    member.selectedDiseases.push(disease);
  }

  // if at least one disease chosen, lock and close
  if (member.selectedDiseases.length > 0) {
    this.lockDisease(member);
  }
}

  /* -----------------------------------------
          STEP VALIDATIONS
  ----------------------------------------- */
  validateStep1(): boolean {
    this.fieldErrors = {};

    // Validate all required fields
    if (!this.isValid('productName')) this.fieldErrors.productName = "Product name is required";
    if (!this.isValid('selectedProductType')) this.fieldErrors.selectedProductType = "Select product type";
    if (!this.isValid('pincode')) this.fieldErrors.pincode = "Enter valid 6-digit pincode";
    if (!this.isValid('cityState')) this.fieldErrors.cityState = "City & state is required";
    if (!this.isValid('proposerName')) this.fieldErrors.proposerName = "Enter valid name";
    if (!this.isValid('proposerDOB')) this.fieldErrors.proposerDOB = "Enter valid date of birth";
    if (!this.isValid('proposerGender')) this.fieldErrors.proposerGender = "Select gender";
    if (!this.isValid('proposerPhone')) this.fieldErrors.proposerPhone = "Enter valid 10-digit phone number";
    if (!this.isValid('proposerEmail')) this.fieldErrors.proposerEmail = "Enter valid email address";
    if (!this.isValid('sumInsured')) this.fieldErrors.sumInsured = "Select sum insured";
    if (!this.isValid('aadharNumber')) this.fieldErrors.aadharNumber = "Enter valid Aadhaar number";
    if (!this.isValid('panNumber')) this.fieldErrors.panNumber = "Enter valid PAN number";

    return Object.keys(this.fieldErrors).length === 0;
  }

  validateStep2(): boolean {
    let isValid = true;
    this.step2Error = '';

    // Validate all adults
    for (let i = 0; i < this.adults.length; i++) {
      const adult = this.adults[i];
      this.validateMember(adult);

      if (Object.keys(adult.errors).length > 0) {
        isValid = false;
        this.step2Error = `Please fix errors in Adult ${i + 1} details`;
        break;
      }
    }

    // Validate all children
    if (isValid) {
      for (let i = 0; i < this.children.length; i++) {
        const child = this.children[i];
        this.validateMember(child);

        if (Object.keys(child.errors).length > 0) {
          isValid = false;
          this.step2Error = `Please fix errors in Child ${i + 1} details`;
          break;
        }
      }
    }

    return isValid;
  }

  /* -----------------------------------------
          STEP NAVIGATION
  ----------------------------------------- */
  nextStep() {
    if (this.currentStep === 1) {
      if (!this.validateStep1()) {
        this.showValidationAlert('Please fix all errors in Step 1 before proceeding.');
        return;
      }
    } else if (this.currentStep === 2) {
      if (!this.validateStep2()) {
        this.showValidationAlert(this.step2Error || 'Please complete all member details before proceeding.');
        return;
      }
    }

    this.currentStep++;
  }

  previousStep() {
    if (this.currentStep > 1) this.currentStep--;
  }

  /* -----------------------------------------
          ALERTS AND POPUPS
  ----------------------------------------- */
  showValidationAlert(message: string) {
    // Create a custom alert div instead of using browser alert
    const alertDiv = document.createElement('div');
    alertDiv.className = 'fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded shadow-lg z-50';
    alertDiv.innerHTML = `
      <div class="flex items-center">
        <svg class="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span>${message}</span>
      </div>
    `;

    document.body.appendChild(alertDiv);

    // Remove alert after 5 seconds
    setTimeout(() => {
      if (document.body.contains(alertDiv)) {
        document.body.removeChild(alertDiv);
      }
    }, 5000);
  }

  openPopup() {
    this.popupOpen = true;
  }

  closePopup() {
    this.popupOpen = false;
  }

isSubmitting = false; // keep this in the class

submitProposal(event?: Event) {
  // Stop any default browser submit (just in case there is a <form>)
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  // Avoid double-click spam
  if (this.isSubmitting) {
    return;
  }

  // Re-validate both steps (safety)
  const step1Ok = this.validateStep1();
  const step2Ok = this.validateStep2();

  if (!step1Ok) {
    this.currentStep = 1;
    this.showValidationAlert('Please correct errors in Step 1.');
    return;
  }

  if (!step2Ok) {
    this.currentStep = 2;
    this.showValidationAlert(this.step2Error || 'Please correct errors in Step 2.');
    return;
  }

  const payload = {
    ...this.proposalData,
    adults: this.adults,
    children: this.children,
  };

  console.log('Submitting proposal payload:', payload);

  // 🔹 OPEN POPUP IMMEDIATELY ON FIRST CLICK
  this.popupOpen = true;
  this.isSubmitting = true;

  this.api.saveHealthProposal(payload).subscribe({
    next: () => {
      this.isSubmitting = false;
      // popup stays open, no second click needed
    },
    error: () => {
      this.isSubmitting = false;
      // close popup if API fails
      this.popupOpen = false;
      this.showValidationAlert('Failed to submit proposal. Please try again.');
    },
  });
}


  showSuccessAlert(message: string) {
    const successDiv = document.createElement('div');
    successDiv.className = 'fixed top-4 right-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded shadow-lg z-50';
    successDiv.innerHTML = `
      <div class="flex items-center">
        <svg class="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span>${message}</span>
      </div>
    `;

    document.body.appendChild(successDiv);

    setTimeout(() => {
      if (document.body.contains(successDiv)) {
        document.body.removeChild(successDiv);
      }
    }, 5000);
  }

  /* -----------------------------------------
          CLOSE DROPDOWN ON OUTSIDE CLICK
  ----------------------------------------- */
  @HostListener('document:click', ['$event'])
  clickOutside(event: Event) {
    if (!this.eRef.nativeElement.contains(event.target)) {
      this.adults.forEach(a => (a.dropdownOpen = false));
      this.children.forEach(c => (c.dropdownOpen = false));
    }
  }
}
