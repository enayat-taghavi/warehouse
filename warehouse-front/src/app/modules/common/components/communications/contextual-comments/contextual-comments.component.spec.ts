// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runInInjectionContext, Injector } from '@angular/core';
import { ContextualCommentsComponent } from './contextual-comments.component';
import { CommunicationService, GenericComment } from '../../../../../core/services/communication.service';
import { Subject } from 'rxjs';

describe('ContextualCommentsComponent', () => {
  let component: ContextualCommentsComponent;
  let commServiceMock: any;
  let incomingCommentSubject: Subject<GenericComment>;

  beforeEach(() => {
    incomingCommentSubject = new Subject<GenericComment>();

    commServiceMock = {
      incomingComment$: incomingCommentSubject,
      subscribeComments: vi.fn(),
      unsubscribeComments: vi.fn(),
      getComments: vi.fn().mockResolvedValue([
        { id: 'cmt-1', text: 'کامنت اولیه', object_id: '100', author: 1, created_at: new Date().toISOString() }
      ]),
      getContacts: vi.fn().mockResolvedValue([
        { id: 10, username: 'ali_m', full_name: 'علی محمدی' },
        { id: 20, username: 'reza_k', full_name: 'رضا کریمی' }
      ]),
      postComment: vi.fn().mockResolvedValue({
        id: 'cmt-2',
        text: 'کامنت جدید @[10:علی محمدی]',
        object_id: '100',
        author: 1,
        created_at: new Date().toISOString()
      })
    };

    const injector = Injector.create({
      providers: [
        { provide: CommunicationService, useValue: commServiceMock }
      ]
    });

    runInInjectionContext(injector, () => {
      component = new ContextualCommentsComponent();
    });
  });

  afterEach(() => {
    if (component) {
      component.ngOnDestroy();
    }
  });

  it('should create component instance with defaults', () => {
    expect(component).toBeTruthy();
    expect(component.modelName).toBe('item');
    expect(component.appLabel).toBe('inventory');
    expect(component.comments().length).toBe(0);
  });

  it('should subscribe on init and unsubscribe on destroy for live comments', () => {
    component.modelName = 'item';
    component.objectId = '100';

    component.ngOnInit();
    expect(commServiceMock.subscribeComments).toHaveBeenCalledWith('item', '100');

    component.ngOnDestroy();
    expect(commServiceMock.unsubscribeComments).toHaveBeenCalledWith('item', '100');
  });

  it('should receive and append incoming live comment for current object', () => {
    component.modelName = 'item';
    component.objectId = '100';
    component.ngOnInit();

    const liveComment: GenericComment = {
      id: 'cmt-live-9',
      text: 'کامنت زنده دریافتی از وب‌سوکت',
      object_id: '100',
      author: 2,
      created_at: new Date().toISOString()
    };

    incomingCommentSubject.next(liveComment);

    const list = component.comments();
    expect(list.some(c => c.id === 'cmt-live-9')).toBe(true);
    expect(list.find(c => c.id === 'cmt-live-9')?.text).toBe('کامنت زنده دریافتی از وب‌سوکت');
  });

  it('should insert standard @[id:name] mention token on selectMention', () => {
    component.newCommentText = 'سلام @علی';
    (component as any).mentionStartIndex = 5;
    component.mentionSearchQuery.set('علی');

    component.selectMention({ id: 10, username: 'ali_m', full_name: 'علی محمدی' });

    expect(component.newCommentText).toBe('سلام @[10:علی محمدی] ');
    expect(component.showMentionDropdown()).toBe(false);
  });

  it('should submit comment with extracted mention tokens and custom appLabel', async () => {
    component.modelName = 'doctask';
    component.appLabel = 'inventory';
    component.objectId = '100';
    component.newCommentText = 'لطفاً بررسی شود @[10:علی محمدی]';

    await component.submitComment();

    expect(commServiceMock.postComment).toHaveBeenCalledWith(
      'doctask',
      '100',
      'لطفاً بررسی شود @[10:علی محمدی]',
      [10],
      undefined,
      'inventory',
      expect.any(String)
    );
    expect(component.comments().some(c => c.id === 'cmt-2')).toBe(true);
  });
});
