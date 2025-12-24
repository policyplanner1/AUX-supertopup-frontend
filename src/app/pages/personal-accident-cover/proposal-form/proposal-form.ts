import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PAService } from '../../../services/pa.service';
import { Router } from '@angular/router';

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

  proposerName: string;
  gender: GenderType | '';
  dob: string;
  mobile: string;

  cityState: string;

  occupation: OccupationType | '';
  annualIncome: AnnualIncomeType | '';

  // ✅ Your UI selection from risk list (occupation name like Doctors/Drivers)
  designation: string;
  coverAmount: string;

  // Additional Covers
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

    proposerName: '',
    gender: '',
    dob: '',
    mobile: '',

    cityState: '',


    occupation: '',
    annualIncome: '',

    designation: '',
    coverAmount: '',

    ptdBase: false,
    ppdBase: false,
    ttdBase: false,
  };


  fieldErrors: FieldErrors = {};
  showCoverDropdown: boolean = false;

  popupOpen: boolean = false;
  isSubmitting: boolean = false;

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

   // ✅ Cover Amount dropdown options (value = number string)
  coverAmountOptions: Array<{ value: string; label: string }> = [
    { value: '1000000', label: '10 Lakhs' },
    { value: '1500000', label: '15 Lakhs' },
    { value: '2000000', label: '20 Lakhs' },
    { value: '2500000', label: '25 Lakhs' },
    { value: '3000000', label: '30 Lakhs' },
    { value: '3500000', label: '35 Lakhs' },
    { value: '5000000', label: '50 Lakhs' },
    { value: '7500000', label: '75 Lakhs' },
    { value: '10000000', label: '1 Crore' },
    { value: '20000000', label: '2 Crores' },
    { value: '30000000', label: '3 Crores' },
    { value: '40000000', label: '4 Crores' },
    { value: '50000000', label: '5 Crores' },
  ];
  // Risk popup
  riskError = false;
  showRiskPopup = false;

  // ✅ IMPORTANT: store 1/2/3 (not 0)
  activeRiskTab = 1;
  riskTabs = ['Category 1', 'Category 2', 'Category 3'];

  riskList: Record<number, string[]> = {
    1: [
      'Doctors', 'Lawyers', 'Accountants', 'Architects/Consulting engineers',
      'Teachers', 'Bankers', 'Clerical/administrative functions', 'BFSI professional',
      'Businessman not working on factory floors', 'Homemaker', 'Student',
    ],
    2: [
      'Builders/Contractors', 'Engineers on site', 'Veterinary Doctors', 'Mechanics',
      'Manual labourers not working in mines, explosive industry, electrical intallations and such hazardous industries',
      'Business working on factory floors',
    ],
    3: [
      'Working in mines/explosives', 'Electrical installations', 'Racer',
      'Circus artist or engaged in such other occupation',
      'Engaged full time/ part time in any adventurous activities',
      'Professional sportsperson', 'Professional adventurer/trekker/mountaineer',
      'Defense services', 'Drivers',
    ],
  };

constructor(private api: PAService, private router: Router) {}

  ngOnInit(): void {
    this.selectedPlan = (history.state as any)?.selectedPlan || null;

    if (this.selectedPlan) {
      const company = this.selectedPlan?.tag || this.selectedPlan?.insurerName || '';
      const planName = this.selectedPlan?.name || this.selectedPlan?.planName || '';
      this.proposalData.productName = `${company} ${planName}`.trim();
    }

    const saved = localStorage.getItem(this.ENQUIRY_KEY);
    if (saved) {
      try {
        const payload = JSON.parse(saved);
        const gender = payload?.gender || '';
        const details = payload?.details || {};

        console.log('FULL enquiry payload:', payload);
        console.log('DETAILS object:', details);
        console.log('City from enquiry:', details.cityState);

       this.proposalData.proposerName = `${details.firstName || ''} ${details.lastName || ''}`.trim();

        this.proposalData.gender = (gender as any) || '';
        this.proposalData.mobile = details.mobile || '';
        this.proposalData.dob = this.toDateInput(details.dob || '');

        this.proposalData.pincode = details.pincode || '';

        this.proposalData.cityState = details.cityState || '';

        this.proposalData.occupation = this.normalizeOccupation(details.occupation || '');
        this.proposalData.annualIncome = this.normalizeIncome(details.incomeRange || '');

        // ✅ enquiry might store coverAmount as number or text; normalize to dropdown value
        const normalizedCover = this.normalizeCoverAmount(details.coverAmount);
        if (normalizedCover) this.proposalData.coverAmount = normalizedCover;


        // ✅ risk: keep separate
        // details.selectedRiskCategory = occupation name (Doctors/Drivers)
        this.proposalData.designation = details.selectedRiskCategory || '';

        // ✅ stored tab should be 1/2/3
        const tab = Number(details.activeRiskTab || 1);
        this.activeRiskTab = tab >= 1 && tab <= 3 ? tab : 1;
      } catch (e) {
        console.error('Failed to parse pa_enquiry', e);
      }
    }

    const selectedProduct = localStorage.getItem('selectedProductName');
    if (selectedProduct) this.proposalData.productName = selectedProduct;

   // ✅ if plan has cover amount and enquiry didn't set it, normalize
    const cover = this.selectedPlan?.coverAmount || this.selectedPlan?.sumInsured;
    if (cover && !this.proposalData.coverAmount) {
      const normalized = this.normalizeCoverAmount(cover);
      if (normalized) this.proposalData.coverAmount = normalized;
    }
  }


  goBack() {
    window.history.back();
  }

  backToQuotes() {
  // If user opened popup, close it first
  if (this.popupOpen) {
    this.closePopup();
    return;
  }

  // Close dropdown if open (avoids overlay blocking clicks)
  this.showCoverDropdown = false;

  // ✅ go back to Quotes page using browser history
  window.history.go(-1);
}

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


toggleCoverDropdown() {
  this.showCoverDropdown = !this.showCoverDropdown;
}

closeCoverDropdown() {
  this.showCoverDropdown = false;
}

selectCoverAmount(val: string) {
  this.proposalData.coverAmount = val;

  // remove error when selected
  delete this.fieldErrors.coverAmount;

  this.showCoverDropdown = false;
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
    if (!this.isCityValid(this.proposalData.cityState)) this.fieldErrors.cityState = 'Enter valid city';

    if (!this.isSimpleName(this.proposalData.proposerName)) this.fieldErrors.proposerName = 'Enter valid name';
    if (!this.proposalData.gender) this.fieldErrors.gender = 'Gender is required';
    if (!this.isDateInputValid(this.proposalData.dob)) this.fieldErrors.dob = 'Select valid date of birth';

    if (!this.isPhoneValid(this.proposalData.mobile)) this.fieldErrors.mobile = 'Enter valid 10-digit mobile number';

    if (!this.proposalData.occupation) this.fieldErrors.occupation = 'Select occupation';
    if (!this.proposalData.annualIncome) this.fieldErrors.annualIncome = 'Select annual income';

    // ✅ Risk occupation is required
    if (!this.proposalData.designation) {
      this.fieldErrors.designation = 'Please select Nature of work/Designation';
      this.riskError = true;
    }

    // ✅ must be one of dropdown options now
    if (!this.isCoverAmountValid(this.proposalData.coverAmount)) {
      this.fieldErrors.coverAmount = 'Please select a valid cover amount';
    }

    return Object.keys(this.fieldErrors).length === 0;
  }

  /* =========================
      ✅ SUBMIT (Same as SuperTopup flow)
      ✅ Now sends NEW DB columns
  ========================= */
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

  // ✅ OPEN POPUP IMMEDIATELY (same as supertopup)
  this.popupOpen = true;
  this.isSubmitting = true;
  document.body.style.overflow = 'hidden';

  // ✅ FINAL payload (SUPER TOPUP NAMING + NEW DB LABELS)
  const payload: any = {
    ...this.proposalData,

    // ✅ IMPORTANT: backend controller expects selectedProductType (not productType)
    selectedProductType: this.proposalData.productType,

    // ✅ DB required columns
    plan_type: 'pa',
    proposer_risk_category: this.activeRiskTab, // 1/2/3


    submittedAt: new Date().toISOString(),
  };

  console.log('Submitting PA proposal payload:', payload);

  // ✅ CALL SAME METHOD NAME AS SUPERTOPUP FLOW
  this.api.saveHealthProposal(payload).subscribe({
    next: () => {
      this.isSubmitting = false;
      // popup stays open (same behavior)
    },
    error: (err) => {
      console.log('PA submit error:', err);
      this.isSubmitting = false;
      this.popupOpen = false;
      document.body.style.overflow = '';
      this.showValidationAlert('Failed to submit proposal. Please try again.');
    },
  });
}


  closePopup() {
    this.popupOpen = false;
    this.isSubmitting = false;
    document.body.style.overflow = '';
  }

  openPopup() {
    this.popupOpen = true;
  }

  // ✅ Needed because HTML uses (keydown)="blockNonDigits($event)"
  blockNonDigits(event: KeyboardEvent) {
    const allowed = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (allowed.includes(event.key)) return;

    if (!/^[0-9]$/.test(event.key)) {
      event.preventDefault();
    }
  }

  // ✅ Needed because HTML uses (paste)="blockNonDigitPaste($event)"
  blockNonDigitPaste(event: ClipboardEvent) {
    const pasted = event.clipboardData?.getData('text') || '';
    if (!/^[0-9]+$/.test(pasted)) {
      event.preventDefault();
    }
  }

    /* =========================
      COVER AMOUNT HELPERS ✅
  ========================= */

  // ✅ returns label for current selected value
  getCoverAmountLabel(v: string): string {
    const found = this.coverAmountOptions.find((x) => x.value === String(v || '').trim());
    return found?.label || 'Not Provided';
  }

  // ✅ normalize enquiry/plan coverAmount into dropdown value
  private normalizeCoverAmount(raw: any): string {
    if (raw === null || raw === undefined) return '';

    // number like 1000000
    const asNum = Number(String(raw).replace(/,/g, '').trim());
    if (Number.isFinite(asNum) && asNum > 0) {
      const match = this.coverAmountOptions.find((x) => Number(x.value) === asNum);
      return match ? match.value : '';
    }

    // text like "10 lakhs", "1 crore", "2 crorers" (typo-safe)
    const text = String(raw).toLowerCase().replace(/\s+/g, ' ').trim();

    const mapTextToValue: Array<{ rx: RegExp; value: string }> = [
      { rx: /\b10\s*lakh(s)?\b/, value: '1000000' },
      { rx: /\b15\s*lakh(s)?\b/, value: '1500000' },
      { rx: /\b20\s*lakh(s)?\b/, value: '2000000' },
      { rx: /\b25\s*lakh(s)?\b/, value: '2500000' },
      { rx: /\b30\s*lakh(s)?\b/, value: '3000000' },
      { rx: /\b35\s*lakh(s)?\b/, value: '3500000' },
      { rx: /\b50\s*lakh(s)?\b/, value: '5000000' },
      { rx: /\b75\s*lakh(s)?\b/, value: '7500000' },
      { rx: /\b1\s*cr(o)?re(r)?(s)?\b|\bone\s*cr(o)?re\b/, value: '10000000' },
      { rx: /\b2\s*cr(o)?re(r)?(s)?\b/, value: '20000000' },
      { rx: /\b3\s*cr(o)?re(s)?\b/, value: '30000000' },
      { rx: /\b4\s*cr(o)?re(s)?\b/, value: '40000000' },
      { rx: /\b5\s*cr(o)?re(s)?\b/, value: '50000000' },
    ];

    for (const m of mapTextToValue) {
      if (m.rx.test(text)) return m.value;
    }

    return '';
  }

  private isCoverAmountValid(v: string): boolean {
    const val = String(v || '').trim();
    if (!val) return false;
    return this.coverAmountOptions.some((x) => x.value === val);
  }
  /* =========================
      HELPERS
  ========================= */



  private normalizeOccupation(raw: any): any {
    const v = String(raw || '').trim().toLowerCase();
    if (!v) return '';
    if (v.includes('salaried')) return 'salaried';
    if (v.includes('self')) return 'self_employed';
    if (v.includes('other')) return 'other_sources';
    return raw as any;
  }

  private normalizeIncome(raw: any): any {
    const v = String(raw || '').trim();
    if (!v) return '';

    if (/^\d{1,2}-\d{1,2}$/.test(v) || v === '41+') return v;

    const low = v.toLowerCase().replace(/\s+/g, '');
    if (low.includes('3lakh') && low.includes('5lakh')) return '3-5';
    if (low.includes('6lakh') && low.includes('8lakh')) return '6-8';
    if (low.includes('9lakh') && low.includes('12lakh')) return '9-12';
    if (low.includes('13lakh') && low.includes('18lakh')) return '13-18';
    if (low.includes('19lakh') && low.includes('25lakh')) return '19-25';
    if (low.includes('26lakh') && low.includes('40lakh')) return '26-40';
    if (low.includes('41lakh')) return '41+';

    return '';
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

    // ✅ remove error once selected
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

  showValidationAlert(message: string) {
    const alertDiv = document.createElement('div');
    alertDiv.className =
      'fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded shadow-lg z-50';
    alertDiv.innerHTML = `
      <div class="flex items-center">
        <svg class="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span>${message}</span>
      </div>
    `;
    document.body.appendChild(alertDiv);

    setTimeout(() => {
      if (document.body.contains(alertDiv)) document.body.removeChild(alertDiv);
    }, 5000);
  }
}


