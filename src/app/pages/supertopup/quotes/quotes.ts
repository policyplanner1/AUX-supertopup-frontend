import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SuperTopupService } from '../../../services/super-topup.service';
import { toPng } from "html-to-image";
import jsPDF from 'jspdf';

// Define the payload type OUTSIDE the class
type PlanPayload = {
  coverAmount: number;
  age: number;
  sage: number | null;
  c1age: number | null;
  c2age: number | null;
  c3age: number | null;
  c4age: number | null;
};

@Component({
  selector: 'app-quotes',
  standalone: true,   // <-- ADD THIS

  imports: [CommonModule],
  templateUrl: './quotes.html',
  styleUrl: './quotes.scss',
})
export class Quotes implements OnInit {
  results: any[] = [];
  age: number | null = null;
  pincode = '';
  name = '';

  deductibleList = signal<number[]>([]);
  selectedDeductible: number | null = null;

  insurerList = signal<string[]>([]);
  selectedInsurer: string | null = null;

  selectedSort: string | null = null;

  selectedCoverageAmt: number | null = null;
  basePayload: PlanPayload | null = null;

  // Flat plan list used in UI
  plans = signal<any[]>([]);

  // Compare + summary strip
  maxCompare = 3;
  isCompareOpen = false;
  compare: any[] = [];

  familyCount: number | null = null;
  adultCount: number | null = null;
  childCount: number | null = null;

  constructor(private router: Router, private api: SuperTopupService) {}

  ngOnInit(): void {
    const savedData = localStorage.getItem('supertopup_enquiry');

    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        const payload = this.buildPayloadFromLocal(parsed);
        this.basePayload = payload;

        const enquiry = parsed?.details ?? {};
        const members = parsed?.members ?? [];

        this.age = payload.age ?? null;
        this.pincode = enquiry.pincode ?? '';
        this.name = enquiry.firstName ?? '';

        // compute family counts (for compare summary strip)
        this.computeFamilyCounts(members);

        this.fetchAllPlans(payload);
        return;
      } catch (e) {
        console.warn(
          'Failed to parse localStorage supertopup_enquiry, falling back.',
          e
        );
      }
    }
  }

  /* -------------------- build payload from localStorage -------------------- */

  private buildPayloadFromLocal(ls: any): PlanPayload {
    const enquiry = ls?.details ?? [];
    const members = ls?.members ?? [];

    // Extract YOU (primary) age
    const you = members.find((m: any) => m.id === 'you');
    const spouse = members.find((m: any) => m.id === 'spouse');

    // Collect child ages (sons + daughters)
    const childAges: Array<number | null> = [];

    members.forEach((m: any) => {
      if (m.id?.startsWith('son') || m.id?.startsWith('daughter')) {
        childAges.push(this.numOrNull(m.age));
      }
    });

    // pad or trim to exactly 4 entries
    while (childAges.length < 4) childAges.push(null);
    if (childAges.length > 4) childAges.length = 4;

    return {
      coverAmount: this.toNum(enquiry.coverAmount, 0),

      age: this.toNum(you?.age, 0), // YOU age
      sage: this.numOrNull(spouse?.age), // Spouse age or null

      c1age: childAges[0],
      c2age: childAges[1],
      c3age: childAges[2],
      c4age: childAges[3],
    };
  }

  private computeFamilyCounts(members: any[]): void {
    if (!Array.isArray(members)) {
      this.familyCount = null;
      this.adultCount = null;
      this.childCount = null;
      return;
    }

    let adults = 0;
    let kids = 0;

    members.forEach((m: any) => {
      const id = (m?.id || '').toString();
      if (id.startsWith('son') || id.startsWith('daughter') || m?.type === 'child') {
        kids++;
      } else {
        adults++;
      }
    });

    this.adultCount = adults;
    this.childCount = kids;
    this.familyCount = adults + kids;
  }

  /* -------------------- Filters handlers -------------------- */

  onCoverageAmountChange(event: any) {
    const newValue = Number(event.target.value);

    if (!this.basePayload) return;

    this.basePayload.coverAmount = isNaN(newValue) ? 0 : newValue;

    this.fetchAllPlans(this.basePayload);
  }

  onSortChange(event: any) {
    const value = event.target.value;

    if (value === '') {
      this.selectedSort = null;
    } else {
      this.selectedSort = value; // "low" or "high"
    }

    if (this.basePayload) {
      this.fetchAllPlans(this.basePayload);
    }
  }

  onInsurerChange(event: any) {
    const value = event.target.value;

    this.selectedInsurer = value === '' ? null : value;

    if (this.basePayload) {
      this.fetchAllPlans(this.basePayload);
    }
  }

  onDeductibleChange(event: any) {
    const value = event.target.value;

    if (value === '') {
      this.selectedDeductible = null;
    } else {
      this.selectedDeductible = Number(value);
    }

    if (this.basePayload) {
      (this.basePayload as any).deductibleAmount =
        this.selectedDeductible ?? null;

      this.fetchAllPlans(this.basePayload);
    }
  }
buildPlanKey(plan: any): string {
  return plan.uniqueId;
}


  /* -------------------- Fetch + Map all plans -------------------- */

  fetchAllPlans(payload: any) {
    this.api.getHealthPlanEndpoints().subscribe({
      next: (response) => {
        const apiList = response?.data?.map((item: any) => item.api_type) || [];

        this.api.callAllPremiumApis(apiList, payload).subscribe({
          next: (resArray) => {
            // 1️⃣ Extract insurer names
            const insurerNames: string[] = [];
            resArray.forEach((res: any) => {
              if (res?.companyName) {
                insurerNames.push(res.companyName.trim());
              }
            });
            const uniqueInsurers = Array.from(new Set(insurerNames)).sort();
            this.insurerList.set(uniqueInsurers);

            // 2️⃣ Extract all deductibles
            const allDeductibles: number[] = [];
            resArray.forEach((res: any) => {
              if (res?.premiums) {
                res.premiums.forEach((pm: any) => {
                  const d = Number(pm.deductible);
                  if (!isNaN(d)) allDeductibles.push(d);
                });
              }
            });
            const uniqueSorted = Array.from(new Set(allDeductibles)).sort(
              (a, b) => a - b
            );
            this.deductibleList.set(uniqueSorted);

            // 3️⃣ Filter + Map Plans
            const mappedPlans = resArray
              .filter((res: any) => res && res.planName)
              .flatMap((p: any) => {
                let premiums = p.premiums || [];

                // deductible filter
                if (this.selectedDeductible !== null) {
                  premiums = premiums.filter(
                    (pm: any) =>
                      Number(pm.deductible) === this.selectedDeductible
                  );
                }

                // insurer filter
                if (this.selectedInsurer !== null) {
                  if (p.companyName !== this.selectedInsurer) return [];
                }

                const coverAmountNum = Number(p.coverAmount) || 0;

                return premiums.map((pm: any) => {
                  const premiumNum = Number(pm.premium) || 0;
                  const dedNum = Number(pm.deductible) || 0;
              return {
                uniqueId: crypto.randomUUID(),
                // UI fields
                logo: `assets/quote/${p.logoUrl}`,
                name: p.planName,
                tag: p.companyName,
                cover: `₹ ${this.formatIndianCurrency(coverAmountNum)}`,
                deductible: `₹ ${this.formatIndianCurrency(dedNum)}`,
                price: `₹ ${this.formatIndianCurrency(premiumNum)}`,
                features: p.features?.length ? p.features : ['No Key Features Available'],
                brochure: pm.brochureUrl || p.brochureUrl || null,

                // Compare
                planId: pm.planId || p.planId || `${p.planName}-${dedNum}-${premiumNum}`,
                coverAmountNumber: coverAmountNum,
                deductibleNumber: dedNum,
                priceNumber: premiumNum,
                insurerName: p.companyName,
                otherDetails: p.otherDetails,

                // IMPORTANT FOR FEATURES PAGE
                fullPlan: p,        // <-- ADD THIS
                fullPremium: pm,    // <-- ADD THIS
              };

                });
              });

            // 4️⃣ Sorting
            if (this.selectedSort === 'low') {
              mappedPlans.sort(
                (a: any, b: any) => a.priceNumber - b.priceNumber
              );
            } else if (this.selectedSort === 'high') {
              mappedPlans.sort(
                (a: any, b: any) => b.priceNumber - a.priceNumber
              );
            }

            this.plans.set(mappedPlans);
          },
          error: (err) => {
            console.error('Error calling premium APIs:', err);
          },
        });
      },
      error: (err) => {
        console.error('Error fetching endpoints:', err);
      },
    });
  }

  // private buildOtherDetails(p: any, pm: any): Record<string, string> {
  //   const details: Record<string, string> = {};

  //   if (p.companyName) details['Insurer'] = p.companyName;
  //   if (p.planName) details['Plan Name'] = p.planName;
  //   if (p.coverAmount) {
  //     const num = Number(p.coverAmount) || 0;
  //     details['Cover Amount'] = '₹ ' + this.formatIndianCurrency(num);
  //   }
  //   if (pm.deductible != null) {
  //     const d = Number(pm.deductible) || 0;
  //     details['Deductible Amount'] = '₹ ' + this.formatIndianCurrency(d);
  //   }
  //   if (pm.premium != null) {
  //     const pr = Number(pm.premium) || 0;
  //     details['Monthly Premium'] = '₹ ' + this.formatIndianCurrency(pr);
  //   }
  //   if (p.roomType) details['Room Category'] = p.roomType;
  //   if (p.tenure) details['Policy Tenure'] = String(p.tenure);

  //   // if backend sends structured otherDetails JSON, merge it
  //   try {
  //     const extra =
  //       p.otherDetails ||
  //       (p.plan?.other_details
  //         ? JSON.parse(p.plan.other_details)
  //         : undefined);
  //     if (extra && typeof extra === 'object') {
  //       Object.keys(extra).forEach((k) => {
  //         if (extra[k] != null && extra[k] !== '') {
  //           details[k] = String(extra[k]);
  //         }
  //       });
  //     }
  //   } catch {
  //     // ignore parse errors
  //   }

  //   return details;
  // }

  /* -------------------- Compare logic -------------------- */
  allowAadhaarInput(event: any) {
  const allowed = /^[0-9]$/;

  // BLOCK ALL ALPHABETS, SYMBOLS IN ANDROID ALSO
  if (!allowed.test(event.key)) {
    event.preventDefault();
  }
}

  get emptySlots(): number[] {
    const remaining = this.maxCompare - this.compare.length;
    return remaining > 0 ? Array(remaining).fill(0) : [];
  }

isSelected(plan: any): boolean {
  return this.compare.some((p) => p.key === plan.uniqueId);
}

  onCompareToggle(plan: any, event: any) {
  const checked = event.target.checked;
  const key = plan.uniqueId;


  if (checked) {
    if (this.compare.length >= this.maxCompare) {
      alert(`You can compare up to ${this.maxCompare} plans.`);
      event.target.checked = false;
      return;
    }

    if (!this.isSelected(plan)) {
      this.compare.push({
        key: plan.uniqueId,
        planId: plan.planId,
        insurerName: plan.insurerName || plan.tag,
        productName: plan.name,
        logo: plan.logo,
        coverAmount: plan.coverAmountNumber,
        monthlyPrice: plan.priceNumber,
        deductible: plan.deductibleNumber,
        otherDetails: JSON.parse(plan.otherDetails),
        sourcePlan: plan,
      });

      console.log("data",this.compare);
    }
  } else {
    this.compare = this.compare.filter((p) => p.key !== key);
  }
}

  callNow() {
  window.location.href = "tel:+917798612243"; // replace with your number
}

  getDetailsKeys(): string[] {
    console.log("otherdetails",this.compare[0]?.otherDetails);
    return Object.keys(this.compare[0]?.otherDetails || {});
  }

  removeFromCompare(plan: any) {
    this.compare = this.compare.filter((p) => p.planId !== plan.planId);
  }

  removeFromCompare2(plan: any) {
    this.removeFromCompare(plan);
  }

  clearCompare() {
    this.compare = [];
  }

  compareNow() {
    if (this.compare.length >= 2) {
      this.isCompareOpen = true;
    } else {
      alert('Select at least 2 plans to compare.');
    }
  }

  closeCompare() {
    this.isCompareOpen = false;
  }

  trackByPlanId(index: number, plan: any) {
    return plan.planId || index;
  }

  /* -------------------- Helpers -------------------- */

  // ---- helpers ----
  private toNum(v: any, d = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }

  private numOrNull(v: any): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  formatIndianCurrency(num: number): string {
    if (num >= 10000000) {
      return (
        (num / 10000000).toFixed(2).replace(/\.00$/, '') + ' Cr'
      );
    } else if (num >= 100000) {
      return (
        (num / 100000).toFixed(2).replace(/\.00$/, '') + ' Lakh'
      );
    } else {
      return num.toLocaleString('en-IN');
    }
  }

  // downloadBrochure(url: string) {
  //   window.open(url, '_blank');
  // }
goBack() {
  window.history.back();
}

goToAllFeatures(plan: any) {
  const combined = {
    ...plan.fullPlan,
    premiums: [plan.fullPremium],

    totalBasePremium: Number(plan.fullPremium.premium) || 0,
    totalDiscount: Number(plan.fullPremium.discount) || 0,
    totalPayablePremium: Number(plan.fullPremium.premium) || 0,

    deductible: plan.fullPremium.deductible,
    deductibleAmount: plan.fullPremium.deductible,
    coverAmount: plan.fullPlan.coverAmount,
  };

  this.router.navigate(['supertopup/all-features'], {
    state: { selectedPlan: combined }
  });
}


  goToProposal(plan: any) {
    this.router.navigate(['supertopup/proposal-form'], {
      state: { selectedPlan: plan },
    });
  }

  /* -------------------- PDF Download (same logic) -------------------- */

downloadPDF() {
  const wrapper = document.getElementById('compareWrapper') as HTMLElement | null;
  if (!wrapper) return;

  // 1) Get the parts we actually want in PDF: user strip + comparison area
  const userStrip = wrapper.querySelector('.cmp-user-strip') as HTMLElement | null;
  const pdfRootOriginal = wrapper.querySelector('.cmp-pdf-root') as HTMLElement | null;
  if (!pdfRootOriginal) return;

  // 2) Build a clean export container (no header, no fixed flex stuff)
  const exportContainer = document.createElement('div');
  exportContainer.id = 'compareExport';
  exportContainer.style.position = 'absolute';
  exportContainer.style.top = '0';
  exportContainer.style.left = '0';
  exportContainer.style.zIndex = '-1';              // behind everything → no flicker
  exportContainer.style.backgroundColor = '#ffffff';
  exportContainer.style.display = 'block';
  exportContainer.style.padding = '0';
  exportContainer.style.margin = '0';
  exportContainer.style.width = '100%';
  exportContainer.style.overflow = 'visible';

  // Clone user strip (optional) and comparison root into this container
  if (userStrip) {
    const userStripClone = userStrip.cloneNode(true) as HTMLElement;
    exportContainer.appendChild(userStripClone);
  }
  const pdfRootClone = pdfRootOriginal.cloneNode(true) as HTMLElement;
  exportContainer.appendChild(pdfRootClone);

  document.body.appendChild(exportContainer);

  // 3) Remove flex / height / scroll constraints INSIDE the export container
  const pdfRoot = exportContainer.querySelector('.cmp-pdf-root') as HTMLElement | null;
  if (pdfRoot) {
    pdfRoot.style.display = 'block';
    pdfRoot.style.height = 'auto';
    pdfRoot.style.maxHeight = 'none';
    pdfRoot.style.overflow = 'visible';
  }

  const pdfArea = exportContainer.querySelector('.cmp-pdf-area') as HTMLElement | null;
  if (pdfArea) {
    pdfArea.style.display = 'block';
    pdfArea.style.height = 'auto';
    pdfArea.style.maxHeight = 'none';
    pdfArea.style.overflow = 'visible';
  }

  const tableWrapper = exportContainer.querySelector('.cmp-table-wrapper') as HTMLElement | null;
  if (tableWrapper) {
    tableWrapper.style.display = 'block';
    tableWrapper.style.height = 'auto';
    tableWrapper.style.maxHeight = 'none';
    tableWrapper.style.overflow = 'visible';
  }

  // 4) Capture full height of this export container
  requestAnimationFrame(() => {
    const exportWidth = exportContainer.scrollWidth;
    const exportHeight = exportContainer.scrollHeight;

    toPng(exportContainer, {
      cacheBust: true,
      width: exportWidth,
      height: exportHeight,
      style: {
        width: `${exportWidth}px`,
        height: `${exportHeight}px`,
        overflow: 'visible',
      } as any,
    })
      .then((dataUrl) => {
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgProps = pdf.getImageProperties(dataUrl);

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        // Fit image to page width, keep aspect ratio
        const imgWidth = pdfWidth;
        const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

        let heightLeft = imgHeight;
        let position = 0;

        // First page
        pdf.addImage(dataUrl, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;

        // Additional pages if the content is taller than one page
        while (heightLeft > 0) {
          pdf.addPage();
          position -= pdfHeight; // shift image up by one page height
          pdf.addImage(dataUrl, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pdfHeight;
        }

        pdf.save('comparison.pdf');
      })
      .catch((error) => {
        console.error('PDF export error:', error);
        alert('Unable to export PDF due to browser color incompatibility.');
      })
      .finally(() => {
        // 5) Clean up – remove temporary export container
        document.body.removeChild(exportContainer);
      });
  });
}

/* -------------------- Grid template for compare table -------------------- */

  getGridTemplateColumns(): string {
    const planCount = this.compare?.length || 0;
    return `300px repeat(${planCount || 1}, 1fr)`;
  }
}
