import { Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type TabKey = 'includes' | 'excludes' | 'cashless' | 'claim' | 'addons';

interface PremiumOption {
  id: '1Y' | '2Y' | '3Y';
  label: string;
  amount: number;
  display: string;
  base?: number;
  discount?: number;
  payable?: number;
}

@Component({
  selector: 'app-all-features',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './all-features.html',
  styleUrls: ['./all-features.scss'],
})
export class PAallFeatures implements OnInit {

  constructor(private sanitizer: DomSanitizer) {}

  selectedPlan: any = null;

  insurerLogo = '';
  insurerName = '';
  productName = '';
  proposalData = { productName: '' };

  insured = { self: '', pincode: '' };

  premiumOptions: PremiumOption[] = [];
  selectedTenure: PremiumOption | null = null;

  coverAmount = '';
  deductibleAmount = '';
  membersCovered = '';

  discount = 0;
  private totalPremiumOverride?: number;

  /* ---------- RIGHT PANEL GETTERS ---------- */
  get basePremium(): number {
    return this.selectedTenure?.base || 0;
  }

  get totalPremium(): number {
    if (this.totalPremiumOverride != null) return this.totalPremiumOverride;
    return this.basePremium - this.discount;
  }

  /* ---------- TABS ---------- */
  activeTab: TabKey = 'includes';
  setTab(tab: TabKey) {
    this.activeTab = tab;
  }

  includesList: string[] = [];
  excludesList: string[] = [];

  /* ---------- VIDEO ---------- */
readonly youtubeId = 'yH6jVkIF6pI';

  showYouTube = false;
  youtubeUrl?: SafeResourceUrl;

  startVideo() {
    if (this.showYouTube) return;
    const url = `https://www.youtube.com/embed/${this.youtubeId}?autoplay=1&rel=0`;
    this.youtubeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    this.showYouTube = true;
  }


  /* ---------- SELECT PREMIUM TENURE ---------- */
  chooseTenure(opt: PremiumOption) {
    this.selectedTenure = opt;
    this.discount = Number(opt.discount ?? 0);
    this.totalPremiumOverride = Number(opt.payable ?? (opt.amount - this.discount));
  }


  /* ======================================================
        MAIN INIT — CORRECTED LOGIC
     ====================================================== */
ngOnInit(): void {
  const navState = history.state as any;
  const statePincode = navState?.pincode;
  this.selectedPlan = navState?.selectedPlan ?? null;

  if (!this.selectedPlan) {
    console.warn('❌ No selectedPlan found');
    return;
  }

  console.log("🔥 FULL SelectedPlan:", this.selectedPlan);


    /* ======================================================
       COMPANY + PLAN DETAILS
    ====================================================== */
    const company =
      this.selectedPlan.company?.company_name ||
      this.selectedPlan.companyName ||
      this.selectedPlan.insurer ||
      '';

    const planName =
      this.selectedPlan.plan?.plan_name ||
      this.selectedPlan.planName ||
      this.selectedPlan.productName ||
      '';

    this.insurerName = company;
    this.productName = planName;
    this.proposalData.productName = `${company} ${planName}`.trim();

    /* Logo */
    const logoUrl =
      this.selectedPlan.company?.logo ||
      this.selectedPlan.logoUrl ||
      this.selectedPlan.insurerLogo ||
      this.selectedPlan.logo;

    if (logoUrl) {
      this.insurerLogo = '/assets/quote/' + logoUrl;
    }


    /* ======================================================
         PREMIUM BREAKUP — FIXED COMPLETELY
    ====================================================== */

    const p1 =
      this.selectedPlan.premiums?.[0] ||
      this.selectedPlan.premiumDetails?.year1 ||
      this.selectedPlan.year1 ||
      {};

    const base1 =
      Number(p1.basePremium) ||
      Number(p1.base) ||
      Number(this.selectedPlan.totalBasePremium) ||
      0;

    const disc1 =
      Number(p1.discount) ||
      Number(this.selectedPlan.totalDiscount) ||
      0;

    const pay1 =
      Number(p1.finalPremium) ||
      Number(p1.total) ||
      Number(this.selectedPlan.totalPayablePremium) ||
      (base1 - disc1);


    /* YEAR 2 */
    const p2 = this.selectedPlan.premiums?.[1] || {};
    const base2 = Number(p2.basePremium ?? base1 * 2);
    const disc2 = Number(p2.discount ?? disc1 * 2);
    const pay2 = Number(p2.finalPremium ?? (base2 - disc2));

    /* YEAR 3 */
    const p3 = this.selectedPlan.premiums?.[2] || {};
    const base3 = Number(p3.basePremium ?? base1 * 3);
    const disc3 = Number(p3.discount ?? disc1 * 3);
    const pay3 = Number(p3.finalPremium ?? (base3 - disc3));


    /* BUILD FINAL PREMIUM OPTIONS */
    this.premiumOptions = [
      {
        id: '1Y',
        label: '1 Year',
        amount: base1,
        base: base1,
        discount: disc1,
        payable: pay1,
        display: this.formatINR(pay1),
      },
      {
        id: '2Y',
        label: '2 Year',
        amount: base2,
        base: base2,
        discount: disc2,
        payable: pay2,
        display: this.formatINR(pay2),
      },
      {
        id: '3Y',
        label: '3 Year',
        amount: base3,
        base: base3,
        discount: disc3,
        payable: pay3,
        display: this.formatINR(pay3),
      },
    ];

    /* DEFAULT SELECT 1Y */
    this.selectedTenure = this.premiumOptions[0];
    this.discount = disc1;
    this.totalPremiumOverride = pay1;


    /* ======================================================
       COVER AMOUNT
    ====================================================== */
    const cover =
      this.selectedPlan.coverAmount ||
      this.selectedPlan.sumInsured ||
      this.selectedPlan.cover ||
      null;

    if (cover) {
      this.coverAmount = '₹ ' + Number(cover).toLocaleString('en-IN');
    }


    /* ======================================================
       DEDUCTIBLE — FIXED
    ====================================================== */
    const deductible =
      this.selectedPlan.deductible ||
      this.selectedPlan.deductibleAmount ||
      this.selectedPlan.deductibleValue ||
      this.selectedPlan.plan?.deductible ||
      null;

    if (deductible) {
      this.deductibleAmount = '₹ ' + Number(deductible).toLocaleString('en-IN');
    }



    /* ======================================================
       AGE + PINCODE
    ====================================================== */
    const age =
      this.selectedPlan.eldestActualAge ||
      this.selectedPlan.eldestActual ||
      this.selectedPlan.eldestLookupAge ||
      this.selectedPlan.eldestLookup;

    this.insured.self = age ? `Self: ${age} years` : '';

  const pincode =
  statePincode ||
  this.selectedPlan?.pincode ||
  this.selectedPlan?.inputPincode ||
  this.selectedPlan?.memberPincode ||
  this.selectedPlan?.contactDetails?.pincode ||
  this.selectedPlan?.proposerDetails?.pincode ||
  this.selectedPlan?.quoteInput?.pincode ||
  this.selectedPlan?.personalDetails?.pincode ||
  this.selectedPlan?.personalDetails?.pinCode ||
  this.selectedPlan?.data?.pincode ||
  this.selectedPlan?.input?.pincode ||
  this.selectedPlan?.customer?.pincode ||
  this.selectedPlan?.location?.pincode ||
  '';

this.insured.pincode = pincode
  ? `Pincode: ${pincode}`
  : '';


this.insured.pincode = pincode ? `Pincode: ${pincode}` : 'Pincode: Not Available';

this.insured.pincode = pincode ? `Pincode: ${pincode}` : '';

console.log("🔍 FULL SelectedPlan DATA:", this.selectedPlan);





    /* ======================================================
       MEMBERS COVERED
    ====================================================== */
    const adults = Number(this.selectedPlan.noOfAdults || 0);
    const children = Number(this.selectedPlan.noOfChildren || 0);

    const list = [];
    if (adults) list.push(`${adults} Adult${adults > 1 ? 's' : ''}`);
    if (children) list.push(`${children} Child${children > 1 ? 'ren' : ''}`);
    this.membersCovered = list.join(', ');



    /* ======================================================
       FEATURES
    ====================================================== */
    const rawFeatures = this.selectedPlan.features ?? [];
    this.includesList = rawFeatures.map((f: any) => f.includes).filter((v: any) => v);
    this.excludesList = rawFeatures.map((f: any) => f.excludes).filter((v: any) => v);
  }

goBack() {
  window.history.back();
}

  /* ---------- FORMATTER ---------- */
  private formatINR(value: number): string {
    return '₹' + Number(value || 0).toLocaleString('en-IN');
  }
}
