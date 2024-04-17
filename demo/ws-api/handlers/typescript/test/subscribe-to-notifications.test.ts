/*! Copyright [Amazon.com](http://amazon.com/), Inc. or its affiliates. All Rights Reserved.
PDX-License-Identifier: Apache-2.0 */
import { SubscribeToNotificationsChainedRequestInput } from 'wsApi-typescript-runtime';
import { subscribeToNotifications } from '../src/subscribe-to-notifications';

// Common request arguments
const requestArguments = {
  chain: undefined as never,
  connectionId: 'test',
  sdk: {} as any,
  event: {} as any,
  context: {} as any,
  interceptorContext: {
    logger: {
      info: jest.fn(),
    },
  },
} satisfies Omit<SubscribeToNotificationsChainedRequestInput, 'input'>;

describe('SubscribeToNotifications', () => {
  it('should not throw', async () => {
    // TODO: Update the test as appropriate when you implement your handler
    await subscribeToNotifications({
      ...requestArguments,
      // TODO: remove the "as any" below and fill in test values for the input
      input: {} as any,
    });
  });
});
