import { Component } from '@angular/core'
import { RouterLink } from '@angular/router'

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="root">
      <section class="card">
        <h1>Gantt Editor Angular Demo</h1>
        <p>
          This app mirrors the Vue demo shell and router shape and starts with a single migrated route.
        </p>
        <ul>
          <li><a routerLink="/small-example">Small example</a></li>
        </ul>
      </section>
    </main>
  `,
  styles: [
    `
      .root {
        min-height: 100vh;
        padding: 24px;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        background: #f8fafc;
      }

      .card {
        max-width: 860px;
        margin: 0 auto;
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 24px;
      }

      h1 {
        margin-top: 0;
      }

      a {
        color: #0f766e;
        font-weight: 700;
      }
    `,
  ],
})
export class HomePageComponent {}
