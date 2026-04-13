import { Routes } from '@angular/router'
import { E2eHarnessPageComponent } from './pages/e2e-harness-page.component'
import { HomePageComponent } from './pages/home-page.component'
import { SmallExamplePageComponent } from './pages/small-example-page.component'

export const routes: Routes = [
  {
    path: '',
    component: HomePageComponent,
  },
  {
    path: 'small-example',
    component: SmallExamplePageComponent,
  },
  {
    path: 'e2e-harness',
    component: E2eHarnessPageComponent,
  },
]
