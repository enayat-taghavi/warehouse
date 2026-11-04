import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CommunicationService } from '../../../../../core/services/communication.service';
import { ChatDrawerComponent } from '../chat-drawer/chat-drawer.component';

@Component({
  selector: 'app-chat-page',
  standalone: true,
  imports: [CommonModule, ChatDrawerComponent],
  template: `
    <div class="chat-page-shell w-full h-[100dvh] bg-surface-canvas overflow-hidden flex flex-col" dir="rtl">
      <app-chat-drawer mode="page" class="w-full h-full flex flex-col flex-1 min-h-0" />
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100dvh;
      overflow: hidden;
    }
  `]
})
export class ChatPageComponent implements OnInit, OnDestroy {
  private commService = inject(CommunicationService);

  ngOnInit(): void {
    // هنگام ورود به صفحهٔ کامل چت، کشوی شناور بسته می‌شود و وضعیت صفحهٔ کامل فعال می‌گردد
    this.commService.isChatDrawerOpen.set(false);
    this.commService.isChatFullPageOpen.set(true);
  }

  ngOnDestroy(): void {
    this.commService.isChatFullPageOpen.set(false);
  }
}
