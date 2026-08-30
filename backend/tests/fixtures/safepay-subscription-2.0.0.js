/**
 * Real Safepay 2.0.0 subscription webhook payloads.
 *
 * Captured from Safepay's sandbox on 2026-08-29 by sending one test event of
 * each type at their dashboard, with the endpoint pointed at a tunnel. These
 * are their bytes, not ours: the field names, the nesting, the protobuf
 * timestamps and the status vocabulary are all exactly what arrived.
 *
 * Two deliberate edits, neither of which touches shape:
 *
 *   • `merchant_api_key` is replaced with zeroes. It is this account's public
 *     key rather than a secret, but a fixture has no use for it.
 *   • The tests re-sign these with their own secret. The real signatures were
 *     verified live against the real webhook secret — that is how we know
 *     2.0.0 signs the raw body — and a captured signature in the repository
 *     would only rot.
 *
 * What these do NOT contain, and the reason the adapter still cannot bind a
 * subscription to a school: no `reference`, no `user_id`, no metadata. Whether
 * a real subscription (as opposed to a dashboard test event) carries the
 * `reference` we put in the checkout URL is unverified — Safepay's sandbox
 * subscription checkout stops at `recaptcha_token is required`.
 */

/** `subscription.created` — data.status = "INCOMPLETE" */
export const SUBSCRIPTION_CREATED = {
  "token": "evt_f52958fa-87ca-44ff-834a-31f3367d6b44",
  "version": "2.0.0",
  "merchant_api_key": "sec_00000000-0000-0000-0000-000000000000",
  "type": "subscription.created",
  "endpoint": "https://example.com",
  "data": {
    "amount": 100000,
    "balance": "0",
    "billing_cycle_anchor": {
      "nanos": 43879925,
      "seconds": 1788019762
    },
    "created_at": {
      "nanos": 43881345,
      "seconds": 1788019762
    },
    "currency": "PKR",
    "current_period_end_date": {
      "nanos": 43880795,
      "seconds": 1788106162
    },
    "current_period_start_date": {
      "nanos": 43880615,
      "seconds": 1788019762
    },
    "customer_email": "hzaidi@getsafepay.com",
    "expires": true,
    "id": "sub_73f6b269-4c8e-44d6-b55e-b982ef5f2835",
    "number_of_billing_cycles": 2,
    "plan_id": "plan_c749c21e-f075-4cc4-8d3d-4e44e6bf3623",
    "started_at": {
      "nanos": 43880425,
      "seconds": 1788019762
    },
    "status": "INCOMPLETE",
    "updated_at": {
      "nanos": 43881195,
      "seconds": 1788019762
    }
  },
  "created_at": {
    "seconds": 1788019762,
    "nanos": 43881665
  }
};

/** `subscription.canceled` — data.status = "CANCELED" */
export const SUBSCRIPTION_CANCELED = {
  "token": "evt_1e332e38-680e-4be6-b4d1-e6535bc539d5",
  "version": "2.0.0",
  "merchant_api_key": "sec_00000000-0000-0000-0000-000000000000",
  "type": "subscription.canceled",
  "endpoint": "https://example.com",
  "data": {
    "amount": 100000,
    "balance": "0",
    "canceled_at": {
      "nanos": 951205853,
      "seconds": 1788025339
    },
    "created_at": {
      "nanos": 951206403,
      "seconds": 1788025339
    },
    "currency": "PKR",
    "customer_email": "hzaidi@getsafepay.com",
    "id": "sub_73f6b269-4c8e-44d6-b55e-b982ef5f2835",
    "plan_id": "plan_c749c21e-f075-4cc4-8d3d-4e44e6bf3623",
    "status": "CANCELED",
    "updated_at": {
      "nanos": 951206253,
      "seconds": 1788025339
    }
  },
  "created_at": {
    "seconds": 1788025339,
    "nanos": 951206693
  }
};

/** `subscription.payment.succeeded` — data.status = "ACTIVE" */
export const SUBSCRIPTION_PAYMENT_SUCCEEDED = {
  "token": "evt_90166cb9-ac94-403f-91e4-1929ad3692b7",
  "version": "2.0.0",
  "merchant_api_key": "sec_00000000-0000-0000-0000-000000000000",
  "type": "subscription.payment.succeeded",
  "endpoint": "https://example.com",
  "data": {
    "amount": 100000,
    "balance": "0",
    "billing_cycle_anchor": {
      "nanos": 117834274,
      "seconds": 1788025464
    },
    "created_at": {
      "nanos": 117835574,
      "seconds": 1788025464
    },
    "currency": "PKR",
    "current_billing_cycle": 1,
    "current_period_end_date": {
      "nanos": 117834844,
      "seconds": 1788111864
    },
    "current_period_start_date": {
      "nanos": 117834674,
      "seconds": 1788025464
    },
    "customer_email": "hzaidi@getsafepay.com",
    "id": "sub_73f6b269-4c8e-44d6-b55e-b982ef5f2835",
    "last_paid_date": {
      "nanos": 117835294,
      "seconds": 1788025464
    },
    "plan_id": "plan_c749c21e-f075-4cc4-8d3d-4e44e6bf3623",
    "status": "ACTIVE",
    "transaction_id": "txn_8b29b706-168d-4b38-991c-ac77620a29b7",
    "transaction_status": "COMPLETE",
    "updated_at": {
      "nanos": 117835434,
      "seconds": 1788025464
    }
  },
  "created_at": {
    "seconds": 1788025464,
    "nanos": 117835884
  }
};

/** `subscription.payment.failed` — data.status = "UNPAID" */
export const SUBSCRIPTION_PAYMENT_FAILED = {
  "token": "evt_c6d96458-38dd-47eb-8221-eac7d6e447f8",
  "version": "2.0.0",
  "merchant_api_key": "sec_00000000-0000-0000-0000-000000000000",
  "type": "subscription.payment.failed",
  "endpoint": "https://example.com",
  "data": {
    "amount": 100000,
    "balance": "0",
    "billing_cycle_anchor": {
      "nanos": 456028912,
      "seconds": 1788025471
    },
    "created_at": {
      "nanos": 456029732,
      "seconds": 1788025471
    },
    "currency": "PKR",
    "customer_email": "hzaidi@getsafepay.com",
    "id": "sub_73f6b269-4c8e-44d6-b55e-b982ef5f2835",
    "plan_id": "plan_c749c21e-f075-4cc4-8d3d-4e44e6bf3623",
    "status": "UNPAID",
    "transaction_error_code": "NONE_TRANSACTION_FAILURE_CODE",
    "transaction_error_message": "insufficient funds",
    "transaction_id": "txn_b54bb42c-bc55-481b-b1d9-fd945f44f8c3",
    "transaction_status": "FAILED",
    "updated_at": {
      "nanos": 456029362,
      "seconds": 1788025471
    }
  },
  "created_at": {
    "seconds": 1788025471,
    "nanos": 456030562
  }
};

/** Every captured event, for tests that walk the whole set. */
export const ALL_2_0_0 = [SUBSCRIPTION_CREATED, SUBSCRIPTION_CANCELED, SUBSCRIPTION_PAYMENT_SUCCEEDED, SUBSCRIPTION_PAYMENT_FAILED];

/**
 * A second delivery of two of the same event types, sent later the same day.
 *
 * Field-for-field these carry the same shape as the four above, so they add
 * nothing to what the adapter can parse. They are here for the one thing the
 * first set cannot show: that two genuine events of the same type arrive with
 * different `token` values.
 *
 * That is what makes idempotency correct rather than lucky. Keying on the
 * event id must let two real events through and stop a redelivery of one — and
 * before the 2.0.0 work the id was derived from the payload bytes, which would
 * have collapsed these two onto each other had their timestamps matched.
 *
 * Both were verified live through the real webhook route, not replayed here.
 */
export const SUBSCRIPTION_CREATED_SECOND = {
  "token": "evt_e79aa9e2-2e22-4e7f-be18-317f23e9dccf",
  "version": "2.0.0",
  "merchant_api_key": "sec_00000000-0000-0000-0000-000000000000",
  "type": "subscription.created",
  "endpoint": "https://example.com",
  "data": {
    "amount": 100000,
    "balance": "0",
    "billing_cycle_anchor": {
      "nanos": 997854231,
      "seconds": 1788030145
    },
    "created_at": {
      "nanos": 997857411,
      "seconds": 1788030145
    },
    "currency": "PKR",
    "current_period_end_date": {
      "nanos": 997856391,
      "seconds": 1788116545
    },
    "current_period_start_date": {
      "nanos": 997854941,
      "seconds": 1788030145
    },
    "customer_email": "hzaidi@getsafepay.com",
    "expires": true,
    "id": "sub_73f6b269-4c8e-44d6-b55e-b982ef5f2835",
    "number_of_billing_cycles": 2,
    "plan_id": "plan_c749c21e-f075-4cc4-8d3d-4e44e6bf3623",
    "started_at": {
      "nanos": 997854701,
      "seconds": 1788030145
    },
    "status": "INCOMPLETE",
    "updated_at": {
      "nanos": 997857181,
      "seconds": 1788030145
    }
  },
  "created_at": {
    "seconds": 1788030145,
    "nanos": 997857731
  }
};

export const SUBSCRIPTION_PAYMENT_SUCCEEDED_SECOND = {
  "token": "evt_aebdc105-c995-47ef-9777-601e5b8ab39d",
  "version": "2.0.0",
  "merchant_api_key": "sec_00000000-0000-0000-0000-000000000000",
  "type": "subscription.payment.succeeded",
  "endpoint": "https://example.com",
  "data": {
    "amount": 100000,
    "balance": "0",
    "billing_cycle_anchor": {
      "nanos": 990101539,
      "seconds": 1788030997
    },
    "created_at": {
      "nanos": 990103039,
      "seconds": 1788030997
    },
    "currency": "PKR",
    "current_billing_cycle": 1,
    "current_period_end_date": {
      "nanos": 990102209,
      "seconds": 1788117397
    },
    "current_period_start_date": {
      "nanos": 990101969,
      "seconds": 1788030997
    },
    "customer_email": "hzaidi@getsafepay.com",
    "id": "sub_73f6b269-4c8e-44d6-b55e-b982ef5f2835",
    "last_paid_date": {
      "nanos": 990102719,
      "seconds": 1788030997
    },
    "plan_id": "plan_c749c21e-f075-4cc4-8d3d-4e44e6bf3623",
    "status": "ACTIVE",
    "transaction_id": "txn_8b29b706-168d-4b38-991c-ac77620a29b7",
    "transaction_status": "COMPLETE",
    "updated_at": {
      "nanos": 990102889,
      "seconds": 1788030997
    }
  },
  "created_at": {
    "seconds": 1788030997,
    "nanos": 990103339
  }
};

/** The same event type twice, from two separate deliveries. */
export const SECOND_DELIVERIES = [
  [SUBSCRIPTION_CREATED, SUBSCRIPTION_CREATED_SECOND],
  [SUBSCRIPTION_PAYMENT_SUCCEEDED, SUBSCRIPTION_PAYMENT_SUCCEEDED_SECOND],
];
