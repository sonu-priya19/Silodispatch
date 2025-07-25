import React, { useEffect, useState } from 'react';
import DriverCompletedBatches from '../components/DriverCompletedBatches';

function DriverDashboard() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedBatch, setExpandedBatch] = useState(null);
  const [otpState, setOtpState] = useState({}); // { [orderId]: { sent: bool, verifying: bool, code: '', msg: '', error: '' } }
  const [paymentState, setPaymentState] = useState({}); // { [orderId]: { paid: bool, paying: bool, delivered: bool, delivering: bool, msg: '', error: '' } }

  const fetchBatches = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/batches/all', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to fetch assigned batches');
      
      // Debug: Log order information
      console.log('Fetched batches:', data);
      data.forEach(batch => {
        console.log(`Batch ${batch._id}:`, {
          orders: batch.orders.length,
          orderDetails: batch.orders.map(order => ({
            id: order._id,
            paymentType: order.paymentType,
            amount: order.amount,
            status: order.status
          }))
        });
      });
      
      setBatches(data);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBatches();
  }, []);

  const handleExpandBatch = (batchId) => {
    setExpandedBatch(expandedBatch === batchId ? null : batchId);
  };

  const handleNavigate = async (address, orderId) => {
    // Record navigation action
    try {
      await fetch(`/api/orders/${orderId}/start-navigation`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
    } catch (err) {
      console.error('Failed to record navigation:', err);
    }
    
    // Open navigation
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
  };

  const handleSendOtp = async (orderId) => {
    setOtpState(prev => ({ ...prev, [orderId]: { ...prev[orderId], sent: false, verifying: false, msg: '', error: '' } }));
    try {
      const res = await fetch(`/api/orders/${orderId}/send-otp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to send OTP');
      setOtpState(prev => ({ ...prev, [orderId]: { ...prev[orderId], sent: true, msg: 'OTP sent to customer', error: '' } }));
    } catch (err) {
      setOtpState(prev => ({ ...prev, [orderId]: { ...prev[orderId], sent: false, msg: '', error: err.message } }));
    }
  };

  const handleOtpInput = (orderId, value) => {
    setOtpState(prev => ({ ...prev, [orderId]: { ...prev[orderId], code: value } }));
  };

  const handleVerifyOtp = async (orderId) => {
    setOtpState(prev => ({ ...prev, [orderId]: { ...prev[orderId], verifying: true, msg: '', error: '' } }));
    try {
      const otpCode = otpState[orderId]?.code;
      const res = await fetch(`/api/orders/${orderId}/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ otpCode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'OTP verification failed');
      
      // Update local OTP state
      setOtpState(prev => ({ 
        ...prev, 
        [orderId]: { 
          ...prev[orderId], 
          verifying: false, 
          msg: 'OTP verified!', 
          error: '',
          verified: true 
        } 
      }));
      
      // Update the order in batches state with the returned order data
      if (data.order) {
        setBatches(prev => prev.map(batch => ({
          ...batch,
          orders: batch.orders.map(order => 
            order._id === orderId ? { ...order, ...data.order } : order
          )
        })));
      }
    } catch (err) {
      setOtpState(prev => ({ ...prev, [orderId]: { ...prev[orderId], verifying: false, msg: '', error: err.message } }));
    }
  };

  const debugOrder = async (orderId) => {
    try {
      const res = await fetch(`/api/orders/debug/${orderId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (res.ok) {
        console.log('Order debug info:', data);
        alert(`Order Debug Info:\nPayment Type: ${data.paymentType}\nAmount: ${data.amount}\nStatus: ${data.status}\nPayment Status: ${data.paymentStatus}`);
      } else {
        console.error('Debug failed:', data);
      }
    } catch (err) {
      console.error('Debug error:', err);
    }
  };

  const handleCollectCash = async (orderId) => {
    setPaymentState(prev => ({ ...prev, [orderId]: { ...prev[orderId], paying: true, msg: '', error: '' } }));
    try {
      const res = await fetch(`/api/orders/${orderId}/collect-cash`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('Cash collection failed:', data);
        // Debug the order if collection fails
        await debugOrder(orderId);
        throw new Error(data.message || 'Failed to collect cash');
      }
      
      // Update local payment state
      setPaymentState(prev => ({ 
        ...prev, 
        [orderId]: { 
          ...prev[orderId], 
          paying: false, 
          paid: true, 
          msg: 'Cash received!', 
          error: '' 
        } 
      }));
      
      // Update the order in batches state with the returned order data
      if (data.order) {
        setBatches(prev => prev.map(batch => ({
          ...batch,
          orders: batch.orders.map(order => 
            order._id === orderId ? { ...order, ...data.order } : order
          )
        })));
      }
      
      // Refresh batches to get updated data
      setTimeout(() => {
        fetchBatches();
      }, 1000);
    } catch (err) {
      console.error('Cash collection error:', err);
      setPaymentState(prev => ({ ...prev, [orderId]: { ...prev[orderId], paying: false, paid: false, msg: '', error: err.message } }));
    }
  };

  const handleCollectUpi = async (orderId, amount) => {
    setPaymentState(prev => ({ ...prev, [orderId]: { ...prev[orderId], paying: true, msg: '', error: '' } }));
    try {
      // 1. Create Razorpay order on backend
      const res = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ 
          amount, 
          receipt: orderId,
          notes: {
            orderId: orderId
          }
        }),
      });
      const order = await res.json();
      if (!res.ok) throw new Error(order.error || 'Failed to create Razorpay order');

      // 2. Open Razorpay modal for UPI payment
      const options = {
        key: process.env.REACT_APP_RAZORPAY_KEY_ID || 'rzp_test_AzaxT5qLnCuqBZ',
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'SiloDispatch',
        description: `Payment for Order ${orderId.slice(-5)}`,
        order_id: order.id,
        prefill: {
          name: 'Customer',
          email: 'customer@example.com',
          contact: '8317371950',
        },
        notes: {
          orderId: orderId
        },
        theme: { 
          color: '#3399cc',
          hide_topbar: false
        },
        handler: async function (response) {
          console.log('Payment successful:', response);
          try {
            // Verify payment on backend
            const verifyRes = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                Authorization: `Bearer ${localStorage.getItem('token')}`
              },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                orderId: orderId
              })
            });
            const verifyData = await verifyRes.json();
            if (verifyRes.ok) {
              setPaymentState(prev => ({ 
                ...prev, 
                [orderId]: { 
                  ...prev[orderId], 
                  paying: false, 
                  paid: true, 
                  msg: 'UPI payment successful!', 
                  error: '' 
                } 
              }));
              
              // Refresh batches to get updated data
              setTimeout(() => {
                fetchBatches();
              }, 1000);
            } else {
              throw new Error(verifyData.message || 'Payment verification failed');
            }
          } catch (err) {
            console.error('Payment verification error:', err);
            setPaymentState(prev => ({ 
              ...prev, 
              [orderId]: { 
                ...prev[orderId], 
                paying: false, 
                paid: false, 
                msg: '', 
                error: err.message 
              } 
            }));
          }
        },
        modal: {
          ondismiss: function() {
            console.log('Payment modal dismissed');
            setPaymentState(prev => ({ 
              ...prev, 
              [orderId]: { 
                ...prev[orderId], 
                paying: false, 
                paid: false, 
                msg: '', 
                error: 'Payment cancelled by user' 
              } 
            }));
          }
        }
      };
      console.log('Razorpay options:', options);
      
      // Check if Razorpay is loaded
      if (!window.Razorpay) {
        throw new Error('Razorpay SDK not loaded. Please check your internet connection.');
      }
      
      try {
        const rzp = new window.Razorpay(options);
        rzp.open();
      } catch (rzpError) {
        console.error('Razorpay initialization error:', rzpError);
        // Fallback to cash collection if Razorpay fails
        console.log('Falling back to cash collection due to Razorpay error');
        setPaymentState(prev => ({ 
          ...prev, 
          [orderId]: { 
            ...prev[orderId], 
            paying: false, 
            paid: false, 
            msg: '', 
            error: 'UPI payment failed. Please collect cash instead.' 
          } 
        }));
      }
    } catch (err) {
      console.error('UPI payment error:', err);
      setPaymentState(prev => ({ ...prev, [orderId]: { ...prev[orderId], paying: false, paid: false, msg: '', error: err.message } }));
    }
  };

  const handleMarkDelivered = async (orderId) => {
    setPaymentState(prev => ({ ...prev, [orderId]: { ...prev[orderId], delivering: true, msg: '', error: '' } }));
    try {
      const res = await fetch(`/api/orders/${orderId}/mark-delivered`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to mark as delivered');
      
      // Update local payment state
      setPaymentState(prev => ({ 
        ...prev, 
        [orderId]: { 
          ...prev[orderId], 
          delivering: false, 
          delivered: true, 
          msg: 'Order delivered!', 
          error: '' 
        } 
      }));
      
      // Update the order in batches state with the returned order data
      if (data.order) {
        setBatches(prev => prev.map(batch => ({
          ...batch,
          orders: batch.orders.map(order => 
            order._id === orderId ? { ...order, ...data.order } : order
          )
        })));
      }
      
      // Show batch completion notification
      if (data.batchCompleted) {
        alert('🎉 Congratulations! All orders in this batch have been delivered successfully!');
      }
      
      // Refresh batches to get updated data
      setTimeout(() => {
        fetchBatches();
      }, 1000);
    } catch (err) {
      setPaymentState(prev => ({ ...prev, [orderId]: { ...prev[orderId], delivering: false, delivered: false, msg: '', error: err.message } }));
    }
  };



  return (
    <div>
      <h2>My Assigned Batches</h2>
      
      {/* Driver Completed Batches Section */}
      <DriverCompletedBatches driverId={JSON.parse(localStorage.getItem('user') || '{}').id || JSON.parse(localStorage.getItem('user') || '{}')._id} />
      
      <hr className="my-4" />
      {loading && <div>Loading...</div>}
      {error && <div className="text-danger">{error}</div>}
      {!loading && !error && batches.length === 0 && <div>No batches assigned for today.</div>}
      {!loading && !error && batches.length > 0 && (
        <div className="row g-3">
          {batches.map(batch => (
            <div className="col-md-6" key={batch._id}>
              <div className="card mb-3 shadow-sm">
                <div className="card-body">
                  <h5 className="card-title">Batch ID: {batch._id.slice(-5).toUpperCase()}</h5>
                  <div><b>Orders:</b> {batch.orders.length}</div>
                  <div><b>Total Weight:</b> {batch.orders.reduce((sum, o) => sum + (o.weight || 0), 0)} kg</div>
                  <button className="btn btn-link p-0" onClick={() => handleExpandBatch(batch._id)}>
                    {expandedBatch === batch._id ? 'Hide Stops' : 'Show Stops'}
                  </button>
                  {expandedBatch === batch._id && (
                    <ul className="mb-0 mt-2">
                      {batch.orders.map(order => (
                        <li key={order._id || order.id || order.orderId || Math.random()}>
                          <div><b>Address:</b> {order.address}, {order.pincode}</div>
                          <div><b>Payment:</b> {order.paymentType} {order.amount ? `| ₹${order.amount}` : ''}</div>
                          <div><b>Status:</b> {order.status} {order.paymentStatus && `| Payment: ${order.paymentStatus}`}</div>
                          
                          {/* Show navigation button if not delivered */}
                          {order.status !== 'DELIVERED' && (
                            <button className="btn btn-sm btn-outline-primary me-2" onClick={() => handleNavigate(order.address, order._id)}>
                              Navigate
                            </button>
                          )}
                          
                          {/* Show arrived button if OTP not verified */}
                          {!order.otpVerified && order.status !== 'DELIVERED' && (
                            <button className="btn btn-sm btn-outline-success me-2" onClick={() => {
                              if (!order._id) {
                                console.warn('Attempted to send OTP for order with undefined _id:', order);
                                return;
                              }
                              handleSendOtp(order._id);
                            }} disabled={otpState[order._id]?.sent}>
                              Arrived
                            </button>
                          )}
                          
                          {/* Show OTP verification status */}
                          {order.otpVerified && (
                            <span className="text-success ms-2">✓ OTP Verified</span>
                          )}
                          
                          {otpState[order._id]?.msg && <span className="text-success ms-2">{otpState[order._id].msg}</span>}
                          {otpState[order._id]?.error && <span className="text-danger ms-2">{otpState[order._id].error}</span>}
                          
                          {/* Show OTP input if OTP was sent but not verified yet */}
                          {otpState[order._id]?.sent && !order.otpVerified && (
                            <div className="mt-2">
                              <input
                                type="text"
                                placeholder="Enter OTP"
                                value={otpState[order._id]?.code || ''}
                                onChange={e => handleOtpInput(order._id, e.target.value)}
                                className="form-control d-inline-block me-2"
                                style={{ width: 120 }}
                                disabled={otpState[order._id]?.verifying}
                              />
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => handleVerifyOtp(order._id)}
                                disabled={otpState[order._id]?.verifying}
                              >
                                Verify OTP
                              </button>
                              {otpState[order._id]?.verifying && <span className="ms-2">Verifying...</span>}
                            </div>
                          )}
                          
                          {/* Payment and delivery actions - only show if OTP verified and not delivered */}
                          {order.otpVerified && order.status !== 'DELIVERED' && (
                            <div className="mt-2">
                              {order.paymentType === 'PREPAID' && (
                                <button
                                  className="btn btn-success btn-sm me-2"
                                  onClick={() => handleMarkDelivered(order._id)}
                                  disabled={paymentState[order._id]?.delivering || paymentState[order._id]?.delivered}
                                >
                                  {paymentState[order._id]?.delivered ? 'Delivered' : 'Mark as Delivered'}
                                </button>
                              )}
                              {order.paymentType === 'COD' && (
                                <>
                                  <button
                                    className="btn btn-warning btn-sm me-2"
                                    onClick={() => handleCollectCash(order._id)}
                                    disabled={paymentState[order._id]?.paying || order.paymentStatus === 'RECEIVED'}
                                  >
                                    {order.paymentStatus === 'RECEIVED' ? 'Cash Received' : 'Collect Cash'}
                                  </button>
                                  <button
                                    className="btn btn-success btn-sm"
                                    onClick={() => handleMarkDelivered(order._id)}
                                    disabled={order.paymentStatus !== 'RECEIVED' || paymentState[order._id]?.delivering || paymentState[order._id]?.delivered}
                                  >
                                    {paymentState[order._id]?.delivered ? 'Delivered' : 'Mark as Delivered'}
                                  </button>
                                </>
                              )}
                              {order.paymentType === 'UPI' && (
                                <>
                                  <button
                                    className="btn btn-info btn-sm me-2"
                                    onClick={() => handleCollectUpi(order._id, order.amount)}
                                    disabled={paymentState[order._id]?.paying || order.paymentStatus === 'RECEIVED'}
                                  >
                                    {order.paymentStatus === 'RECEIVED' ? 'UPI Received' : 'Collect via UPI'}
                                  </button>
                                  <button
                                    className="btn btn-warning btn-sm me-2"
                                    onClick={() => handleCollectCash(order._id)}
                                    disabled={paymentState[order._id]?.paying || order.paymentStatus === 'RECEIVED'}
                                  >
                                    Collect Cash (Fallback)
                                  </button>
                                  <button
                                    className="btn btn-success btn-sm"
                                    onClick={() => handleMarkDelivered(order._id)}
                                    disabled={order.paymentStatus !== 'RECEIVED' || paymentState[order._id]?.delivering || paymentState[order._id]?.delivered}
                                  >
                                    {paymentState[order._id]?.delivered ? 'Delivered' : 'Mark as Delivered'}
                                  </button>
                                </>
                              )}
                              {paymentState[order._id]?.msg && <span className="text-success ms-2">{paymentState[order._id].msg}</span>}
                              {paymentState[order._id]?.error && <span className="text-danger ms-2">{paymentState[order._id].error}</span>}
                            </div>
                          )}
                          
                          {/* Show delivered status */}
                          {order.status === 'DELIVERED' && (
                            <div className="mt-2">
                              <span className="text-success">✓ Order Delivered</span>
                              {order.deliveredAt && (
                                <small className="text-muted ms-2">
                                  {new Date(order.deliveredAt).toLocaleString()}
                                </small>
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DriverDashboard; 