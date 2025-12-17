import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type ProductType = 'new' | 'portability';

type OccupationType = 'salaried' | 'self_employed' | 'other_sources';
type AnnualIncomeType =
  | '3-5'
  | '6-8'
  | '9-12'
  | '13-18'
  | '19-25'
  | '26-40'
  | '41+';

type GenderType = 'Male' | 'Female';

interface ProposalData {
  productName: string;
  productType: ProductType;
  pincode: string;
  cityState: string;

  firstName: string;
  lastName: string;
  gender: GenderType | '';
  dob: string;
  mobile: string;

  insuredPincode: string;
  city: string;

  occupation: OccupationType | '';
  annualIncome: AnnualIncomeType | '';

  designation: string;
  coverAmount: string;

  ptdBase: boolean;
  ppdBase: boolean;
  ttdBase: boolean;
}

type FieldKey = keyof ProposalData;
type FieldErrors = Partial<Record<FieldKey, string>>;

@Component({
  selector: 'app-proposal-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './proposal-form.html',
  styleUrls: ['./proposal-form.scss'],
})
export class PAProposalForm implements OnInit {
  currentStep = 1;
  selectedPlan: any = null;

  private readonly ENQUIRY_KEY = 'pa_enquiry';

  proposalData: ProposalData = {
    productName: '',
    productType: 'new',
    pincode: '',
    cityState: '',

    firstName: '',
    lastName: '',
    gender: '',
    dob: '',
    mobile: '',

    insuredPincode: '',
    city: '',

    occupation: '',
    annualIncome: '',

    designation: '',
    coverAmount: '',

    ptdBase: false,
    ppdBase: false,
    ttdBase: false,
  };

  fieldErrors: FieldErrors = {};

  genderOptions = [
    { value: 'Male' as GenderType, label: 'Male' },
    { value: 'Female' as GenderType, label: 'Female' },
  ];

  occupationOptions = [
    { value: 'salaried' as OccupationType, label: 'Salaried' },
    { value: 'self_employed' as OccupationType, label: 'Self Employment' },
    { value: 'other_sources' as OccupationType, label: 'Income from Other Sources' },
  ];

  incomeOptions = [
    { value: '3-5' as AnnualIncomeType, label: '3 - 5 Lakh' },
    { value: '6-8' as AnnualIncomeType, label: '6 - 8 Lakh' },
    { value: '9-12' as AnnualIncomeType, label: '9 - 12 Lakh' },
    { value: '13-18' as AnnualIncomeType, label: '13 - 18 Lakh' },
    { value: '19-25' as AnnualIncomeType, label: '19 - 25 Lakh' },
    { value: '26-40' as AnnualIncomeType, label: '26 - 40 Lakh' },
    { value: '41+' as AnnualIncomeType, label: '41 and above' },
  ];

  // ✅ readonly label -> editable toggles
  isEditingOccupation = false;
  isEditingIncome = false;

  // Risk popup
  riskError = false;
  showRiskPopup = false;
  activeRiskTab = 0;
  riskTabs = ['Category 1', 'Category 2', 'Category 3'];

  riskList: Record<number, string[]> = {
    1: [
      'Doctors',
      'Lawyers',
      'Accountants',
      'Architects/Consulting engineers',
      'Teachers',
      'Bankers',
      'Clerical/administrative functions',
      'BFSI professional',
      'Businessman not working on factory floors',
      'Homemaker',
      'Student',
    ],
    2: [
      'Builders/Contractors',
      'Engineers on site',
      'Veterinary Doctors',
      'Mechanics',
      'Manual labourers not working in mines, explosive industry, electrical intallations and such hazardous industries',
      'Business working on factory floors',
    ],
    3: [
      'Working in mines/explosives',
      'Electrical installations',
      'Racer',
      'Circus artist or engaged in such other occupation',
      'Engaged full time/ part time in any adventurous activities',
      'Professional sportsperson',
      'Professional adventurer/trekker/mountaineer',
      'Defense services',
      'Drivers',
    ],
  };

ngOnInit(): void {
  this.selectedPlan = (history.state as any)?.selectedPlan || null;

  if (this.selectedPlan) {
    const company = this.selectedPlan?.tag || this.selectedPlan?.insurerName || '';
    const planName = this.selectedPlan?.name || this.selectedPlan?.planName || '';
    this.proposalData.productName = `${company} ${planName}`.trim();
  }

  // ✅ Restore from enquiry localStorage
  const saved = localStorage.getItem(this.ENQUIRY_KEY);
  if (saved) {
    try {
      const payload = JSON.parse(saved);
      const gender = payload?.gender || '';
      const details = payload?.details || {};

      this.proposalData.firstName = details.firstName || '';
      this.proposalData.lastName = details.lastName || '';
      this.proposalData.gender = (gender as any) || '';
      this.proposalData.mobile = details.mobile || '';
      this.proposalData.dob = this.toDateInput(details.dob || '');

      this.proposalData.pincode = details.pincode || '';
      this.proposalData.cityState = details.cityState || details.city || '';

      this.proposalData.insuredPincode = details.pincode || '';
      this.proposalData.city = details.city || '';

      // ✅ IMPORTANT: occupation + income restored and editable
      this.proposalData.occupation = this.normalizeOccupation(details.occupation || '');
      this.proposalData.annualIncome = this.normalizeIncome(details.incomeRange || '');

      this.proposalData.coverAmount = String(details.coverAmount || '');

      // ✅ designation restored and editable via popup
      this.proposalData.designation = details.selectedRiskCategory || '';
      this.activeRiskTab = Number(details.activeRiskTab || 1);

    } catch (e) {
      console.error('Failed to parse pa_enquiry', e);
    }
  }

  const selectedProduct = localStorage.getItem('selectedProductName');
  if (selectedProduct) this.proposalData.productName = selectedProduct;

  const cover = this.selectedPlan?.coverAmount || this.selectedPlan?.sumInsured;
  if (cover && !this.proposalData.coverAmount) this.proposalData.coverAmount = String(cover);
}

  goBack() {
    window.history.back();
  }

  /* =========================
      STEP NAVIGATION (2 steps)
  ========================= */
  nextStep() {
    if (this.currentStep === 1) {
      if (!this.validateStep1()) {
        this.showValidationAlert('Please fill all required fields correctly.');
        return;
      }
      this.currentStep = 2;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  previousStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  /* =========================
      ✅ Occupation/Income edit control
  ========================= */
  startEdit(which: 'occupation' | 'annualIncome') {
    if (which === 'occupation') {
      this.isEditingOccupation = true;
      this.isEditingIncome = false;
    } else {
      this.isEditingIncome = true;
      this.isEditingOccupation = false;
    }
  }

  stopEdit(which: 'occupation' | 'annualIncome') {
    if (which === 'occupation') this.isEditingOccupation = false;
    if (which === 'annualIncome') this.isEditingIncome = false;
  }

  /* =========================
      VALIDATION STEP 1
  ========================= */
  validateStep1(): boolean {
    this.fieldErrors = {};
    this.riskError = false;

    if (!this.proposalData.productName) this.fieldErrors.productName = 'Product name is required';
    if (!this.proposalData.productType) this.fieldErrors.productType = 'Select product type';
    if (!this.isPincodeValid(this.proposalData.pincode)) this.fieldErrors.pincode = 'Enter valid 6-digit pincode';
    if (!this.proposalData.cityState) this.fieldErrors.cityState = 'City & State is required';

    if (!this.isSimpleName(this.proposalData.firstName)) this.fieldErrors.firstName = 'Enter valid first name';
    if (!this.isSimpleName(this.proposalData.lastName)) this.fieldErrors.lastName = 'Enter valid last name';
    if (!this.proposalData.gender) this.fieldErrors.gender = 'Gender is required';
    if (!this.isDateInputValid(this.proposalData.dob)) this.fieldErrors.dob = 'Select valid date of birth';

    if (!this.isPhoneValid(this.proposalData.mobile)) this.fieldErrors.mobile = 'Enter valid 10-digit mobile number';
    if (!this.isPincodeValid(this.proposalData.insuredPincode)) this.fieldErrors.insuredPincode = 'Enter valid 6-digit pincode';
    if (!this.isCityValid(this.proposalData.city)) this.fieldErrors.city = 'Enter valid city';

    if (!this.proposalData.occupation) this.fieldErrors.occupation = 'Select occupation';
    if (!this.proposalData.annualIncome) this.fieldErrors.annualIncome = 'Select annual income';

    if (!this.proposalData.designation) {
      this.fieldErrors.designation = 'Please select Nature of work/Designation';
      this.riskError = true;
    }

    if (!this.isCoverAmountValid(this.proposalData.coverAmount)) this.fieldErrors.coverAmount = 'Enter valid cover amount';

    return Object.keys(this.fieldErrors).length === 0;
  }

  private normalizeOccupation(raw: any): any {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return "";
  if (v.includes("salaried")) return "salaried";
  if (v.includes("self")) return "self_employed";
  if (v.includes("other")) return "other_sources";
  return (raw as any); // if already saved as enum value
}

private normalizeIncome(raw: any): any {
  const v = String(raw || "").trim();
  if (!v) return "";

  // If already enum like "3-5"
  if (/^\d{1,2}-\d{1,2}$/.test(v) || v === "41+") return v;

  // If saved as label like "₹3 Lakh – ₹5 Lakh"
  const low = v.toLowerCase().replace(/\s+/g, "");
  if (low.includes("3lakh") && low.includes("5lakh")) return "3-5";
  if (low.includes("6lakh") && low.includes("8lakh")) return "6-8";
  if (low.includes("9lakh") && low.includes("12lakh")) return "9-12";
  if (low.includes("13lakh") && low.includes("18lakh")) return "13-18";
  if (low.includes("19lakh") && low.includes("25lakh")) return "19-25";
  if (low.includes("26lakh") && low.includes("40lakh")) return "26-40";
  if (low.includes("41lakh")) return "41+";

  return "";
}

  private isPincodeValid(v: string): boolean {
    return /^[1-9][0-9]{5}$/.test((v || '').trim());
  }

  private isSimpleName(v: string): boolean {
    const s = (v || '').trim();
    return !!(s && /^[A-Za-z][A-Za-z ]{1,}$/.test(s));
  }

  private isPhoneValid(v: string): boolean {
    return /^[6-9]\d{9}$/.test((v || '').trim());
  }

  private isCityValid(v: string): boolean {
    const s = (v || '').trim();
    return !!(s && /^[A-Za-z .'-]{2,}$/.test(s));
  }

  private isCoverAmountValid(v: string): boolean {
    const n = Number(String(v || '').trim());
    return Number.isFinite(n) && n > 0;
  }

  private isDateInputValid(v: string): boolean {
    if (!v) return false;
    const d = new Date(v);
    if (d.toString() === 'Invalid Date') return false;
    return d <= new Date();
  }

  private toDateInput(ddmmyyyy: string): string {
    const s = String(ddmmyyyy || '').trim();
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (!m) return '';
    const dd = m[1];
    const mm = m[2];
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  /* =========================
      INPUT HELPERS
  ========================= */
  blockNonDigits(event: KeyboardEvent) {
    const allowed = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (allowed.includes(event.key)) return;
    if (!/^[0-9]$/.test(event.key)) event.preventDefault();
  }

  blockNonDigitPaste(event: ClipboardEvent) {
    const pasted = event.clipboardData?.getData('text') || '';
    if (!/^[0-9]+$/.test(pasted)) event.preventDefault();
  }

  /* =========================
      RISK POPUP
  ========================= */
  openRiskPopup() {
    if (!this.activeRiskTab || this.activeRiskTab < 1) this.activeRiskTab = 1;
    this.showRiskPopup = true;
    this.riskError = false;
  }

  closeRiskPopup() {
    this.showRiskPopup = false;
  }

  selectRisk(item: string) {
    this.proposalData.designation = item;
    delete this.fieldErrors.designation;
    this.riskError = false;
    this.showRiskPopup = false;
  }

  get riskTheme() {
    return {
      brand: 'text-[#006D8D]',
      bg: 'bg-[#EAF6FA]',
      ring: 'ring-[#006D8D]/15',
      pillActive: 'bg-[#006D8D] text-white',
      itemActive: 'bg-[#006D8D] text-white border-[#006D8D]',
      itemHover: 'hover:border-[#006D8D]/30 hover:bg-[#006D8D]/5',
      focusRing: 'focus:ring-[#006D8D]/20',
      chip: 'bg-[#006D8D]/10 text-[#006D8D]',
    };
  }

  /* =========================
      SUMMARY HELPERS
  ========================= */
  formatDate(dateString: string): string {
    if (!dateString) return 'Not Provided';
    const d = new Date(dateString);
    if (d.toString() === 'Invalid Date') return 'Not Provided';
    return d.toLocaleDateString('en-IN');
  }

  getIncomeRangeText(v: string): string {
    const map: Record<string, string> = {
      '3-5': '₹3 Lakh – ₹5 Lakh',
      '6-8': '₹6 Lakh – ₹8 Lakh',
      '9-12': '₹9 Lakh – ₹12 Lakh',
      '13-18': '₹13 Lakh – ₹18 Lakh',
      '19-25': '₹19 Lakh – ₹25 Lakh',
      '26-40': '₹26 Lakh – ₹40 Lakh',
      '41+': '₹41 Lakh and Above',
    };
    return map[v] || 'Not Provided';
  }

  getOccupationText(v: string): string {
    const map: Record<string, string> = {
      salaried: 'Salaried',
      self_employed: 'Self Employment',
      other_sources: 'Income from Other Sources',
    };
    return map[v] || 'Not Provided';
  }

  getSelectedCoversText(): string {
    const covers: string[] = [];
    if (this.proposalData.ptdBase) covers.push('PTD (Base)');
    if (this.proposalData.ppdBase) covers.push('PPD (Base)');
    if (this.proposalData.ttdBase) covers.push('TTD (Base)');
    return covers.length ? covers.join(', ') : 'None';
  }

  /* =========================
      SUBMIT
  ========================= */
  isSubmitting = false;

  submitProposal(event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (this.isSubmitting) return;

    const step1Ok = this.validateStep1();
    if (!step1Ok) {
      this.currentStep = 1;
      this.showValidationAlert('Please correct errors in Step 1.');
      return;
    }

    this.isSubmitting = true;

    const payload = {
      ...this.proposalData,
      submittedAt: new Date().toISOString(),
    };

    console.log('✅ PA Proposal payload:', payload);

    this.isSubmitting = false;
    this.showValidationAlert('✅ Proposal submitted (demo). Connect API to finalize.');
  }

  /* =========================
      ALERT
  ========================= */
  showValidationAlert(message: string) {
    const alertDiv = document.createElement('div');
    alertDiv.className =
      'fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded shadow-lg z-50';
    alertDiv.textContent = message;
    document.body.appendChild(alertDiv);

    setTimeout(() => {
      if (document.body.contains(alertDiv)) document.body.removeChild(alertDiv);
    }, 3500);
  }
}
