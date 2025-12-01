import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { EnquiryForm } from './pages/supertopup/enquiry-form/enquiry-form';
import { ProposalForm } from './pages/supertopup/proposal-form/proposal-form';
import { AllFeatures } from './pages/supertopup/all-features/all-features';
import { Quotes } from './pages/supertopup/quotes/quotes';
import { NotFound } from './pages/not-found/not-found';
import { PAEnquiryFormComponent } from './pages/personal-accident-cover/enquiry-form/enquiry-form';
import { PAQuotesComponent } from './pages/personal-accident-cover/quotes/quotes';

export const routes: Routes = [
  {
    path: 'supertopup',
    children: [
      { path: 'enquiry-form', component: EnquiryForm },
      { path: 'all-features', component: AllFeatures},
      { path: 'quotes', component: Quotes },
      { path: '', redirectTo: 'enquiry-form', pathMatch: 'full' },
      { path: 'proposal-form', component: ProposalForm }
    ]
  },
  {
    path:'personal-accident',
    children: [
      { path: 'enquiry-form', component: PAEnquiryFormComponent },
      { path: 'quotes', component: PAQuotesComponent },
      { path: '', redirectTo: 'enquiry-form', pathMatch: 'full' },
    ]
  },

  { path: 'home', component: Home },
  { path: '', redirectTo: 'supertopup/enquiry-form', pathMatch: 'full' },

  // Not found route (must be last)
  { path: '**', component: NotFound }
];
