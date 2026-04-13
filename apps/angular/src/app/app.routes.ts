import { Routes } from '@angular/router'
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
]
