import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SuperTopupService } from '../../../services/super-topup.service';
import { signal } from '@angular/core';

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
  imports: [CommonModule],
  templateUrl: './quotes.html',
  styleUrl: './quotes.scss',
})

export class Quotes implements OnInit {

  results: any[] = [];
  age: number | null = null;
  pincode = '';

  selectedCoverageAmt: number | null = null;
  basePayload: PlanPayload | null = null;
  plans = signal<any[]>([]);

  constructor(private router: Router, private api: SuperTopupService) { }

  ngOnInit(): void {
    // 1) Prefer localStorage

    // const raw = {
    //   Age: "39",
    //   cover_amount:
    //     "1000000",
    //   cover_for:
    //     "1000",
    //   cust_Pincode:
    //     "416404",
    //   cust_city:
    //     "Cupidatat quis in si",
    //   cust_fname:
    //     "LEVI",
    //   cust_lname:
    //     "HALEY",
    //   cust_mobile:
    //     "9898989898",
    //   daughterCount:
    //     "2",
    //   gender:
    //     "Male",
    //   self:
    //     "on",
    //   sonCount:
    //     "0",
     
    // }

    // localStorage.setItem('healthFormData', JSON.stringify(raw));
    const savedData = localStorage.getItem('supertopup_enquiry');

    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        const payload = this.buildPayloadFromLocal(parsed);
        this.age = payload.age ?? null;
        this.pincode = parsed.cust_Pincode ?? '';
        this.fetchAllPlans(payload);
        return;
      } catch (e) {
        console.warn('Failed to parse localStorage healthFormData, falling back to query params.', e);
      }
    }

  }

  // private buildPayloadFromLocal(ls: any): PlanPayload {
  //   const childAges: Array<number | null> = [];

  //   const sonCount = Number(ls?.sonCount) || 0;
  //   for (let i = 1; i <= sonCount; i++) {
  //     childAges.push(this.numOrNull(ls?.[`son${i}Age`]));
  //   }

  //   const daughterCount = Number(ls?.daughterCount) || 0;
  //   for (let i = 1; i <= daughterCount; i++) {
  //     childAges.push(this.numOrNull(ls?.[`daughter${i}Age`]));
  //   }

  //   while (childAges.length < 4) childAges.push(null);
  //   if (childAges.length > 4) childAges.length = 4;

  //   return {
  //     coverAmount: this.toNum(ls?.cover_amount, 0),
  //     deductibleAmount: this.toNum(ls?.deductibleAmount, 0),
  //     age: this.toNum(ls?.Age, 0),
  //     sage: this.numOrNull(ls?.SAge),
  //     c1age: childAges[0],
  //     c2age: childAges[1],
  //     c3age: childAges[2],
  //     c4age: childAges[3],
  //   };
  // }

  private buildPayloadFromLocal(ls: any): PlanPayload {
  const enquiry = ls?.details ?? [];
  const members = ls?.members ?? [];

  // Extract YOU (primary) age
  const you = members.find((m: any) => m.id === 'you');
  const spouse = members.find((m: any) => m.id === 'spouse');

  // Collect child ages (sons + daughters)
  const childAges: Array<number | null> = [];

  members.forEach((m: any) => {
    if (m.id.startsWith("son") || m.id.startsWith("daughter")) {
      childAges.push(this.numOrNull(m.age));
    }
  });

  // pad or trim to exactly 4 entries
  while (childAges.length < 4) childAges.push(null);
  if (childAges.length > 4) childAges.length = 4;

  return {
    coverAmount: this.toNum(enquiry.coverAmount, 0),

    age: this.toNum(you?.age, 0),      // YOU age
    sage: this.numOrNull(spouse?.age), // Spouse age or null

    c1age: childAges[0],
    c2age: childAges[1],
    c3age: childAges[2],
    c4age: childAges[3],
  };
}


  fetchAllPlans(payload: any) {
    this.api.getHealthPlanEndpoints().subscribe({
      next: (response) => {
        const apiList = response?.data?.map((item: any) => item.api_type) || [];

        this.api.callAllPremiumApis(apiList, payload).subscribe({
          next: (resArray) => {
            const validResults = resArray.filter((res: any) => res && res.planName);

            this.plans.set(
              validResults.flatMap((p: any) =>
                p.premiums?.map((pm: any) => ({
                  logo: `assets/quote/${p.logoUrl}`,
                  name: p.planName,
                  tag: p.companyName,
                  cover: `₹ ${this.formatIndianCurrency(p.coverAmount)}`,
                  deductible: `₹ ${this.formatIndianCurrency(Number(pm.deductible))}`,
                  price: `₹ ${this.formatIndianCurrency(pm.premium)}`,
                  features: p.features?.length ? p.features : ["No Key Features Available"]
                })) || []
              )
            );

            console.log("Plans count:", this.plans.length);

            console.log("Mapped Plans:", this.plans);
          },
          error: (err) => {
            console.error('Error calling premium APIs:', err);
          }
        });
      },
      error: (err) => {
        console.error('Error fetching endpoints:', err);
      }
    });
  }


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
      return (num / 10000000).toFixed(2).replace(/\.00$/, '') + ' Cr';
    } else if (num >= 100000) {
      return (num / 100000).toFixed(2).replace(/\.00$/, '') + ' Lakh';
    } else {
      return num.toLocaleString('en-IN'); // normal formatting
    }
  }


  goToProposal(plan: any) {
    this.router.navigate(['supertopup/proposal-form']);
  }

  slides = [
    {
      imgSrc: 'assets/quote/slide_img1.png',
      title: 'High CSR = higher peace of mind',
      text: 'A higher Claim Settlement Ratio (ideally 95%+) means more claims get paid.'
    },
    {
      imgSrc: 'assets/quote/slide_img2.png',
      title: 'Fast Claim Processing',
      text: 'Get your claims settled quickly with our efficient service.'
    },
    {
      imgSrc: 'assets/quote/slide_img3.png',
      title: 'Expert Guidance',
      text: 'Our experts will help you choose the best insurance plan.'
    }
  ];


}
