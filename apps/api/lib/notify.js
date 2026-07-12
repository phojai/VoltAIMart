/* ============================================================
   VoltAIMart — SIMULATED email notifications.

   No SMTP/email provider is configured (no credentials available),
   so "emails" are recorded as notification records in the JSON-blob
   datastore and surfaced in-app (customer inbox on account.html,
   guest reassurance on track.html). A real integration (SES/SendGrid/
   Resend/etc.) would send the same subject/body from sendOrderEmail()
   instead of only persisting it.
   ============================================================ */
const { nanoid } = require("nanoid");

function fmtMoney(n){ return `₹${Number(n).toLocaleString("en-IN")}`; }

function orderLines(order){
  return order.items.map(i => `  • ${i.name} ×${i.qty} — ${fmtMoney(i.lineTotal)}`).join("\n");
}

const TEMPLATES = {
  order_confirmation: (order) => ({
    subject: `Order confirmed — ${order.id}`,
    body: `Hi ${order.userName},\n\nThanks for shopping at VoltAIMart! Your order ${order.id} is confirmed.\n\n${orderLines(order)}\n\nTotal: ${fmtMoney(order.total)}\nShipping to: ${order.shippingAddress.line1}, ${order.shippingAddress.city} ${order.shippingAddress.pincode}\n\nWe'll let you know as soon as it ships.\n— VoltAIMart`,
  }),
  order_shipped: (order) => ({
    subject: `Your order is on its way — ${order.id}`,
    body: `Hi ${order.userName},\n\nGood news — your order ${order.id} has shipped!\n\n${orderLines(order)}\n\nIt's headed to ${order.shippingAddress.city} ${order.shippingAddress.pincode}. Expect delivery in 1-2 days.\n— VoltAIMart`,
  }),
  order_delivered: (order) => ({
    subject: `Delivered — ${order.id}`,
    body: `Hi ${order.userName},\n\nYour order ${order.id} was delivered. Enjoy!\n\n${orderLines(order)}\n\nLoved something? Leave a review on the product page.\n— VoltAIMart`,
  }),
  order_cancelled: (order) => ({
    subject: `Order cancelled — ${order.id}`,
    body: `Hi ${order.userName},\n\nYour order ${order.id} has been cancelled and any charge will be reversed to the original payment method.\n\n${orderLines(order)}\n\nChanged your mind? The items are back in stock.\n— VoltAIMart`,
  }),
};

/**
 * Records a simulated order email in db.notifications. Mutates db — the
 * caller is responsible for the surrounding writeDB(). Returns the record.
 */
function sendOrderEmail(db, order, type){
  const template = TEMPLATES[type];
  if (!template) return null;
  const { subject, body } = template(order);
  const notification = {
    id: nanoid(10),
    type,
    orderId: order.id,
    userId: order.userId || null,   // null for guest orders — matched by email instead
    email: order.userEmail,
    subject,
    body,
    read: false,
    createdAt: new Date().toISOString(),
  };
  db.notifications.unshift(notification);
  return notification;
}

module.exports = { sendOrderEmail };
