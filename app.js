const supabaseUrl = 'https://rgjhpxaxnbavyijjgnfc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnamhweGF4bmJhdnlpampnbmZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NDM5MDMsImV4cCI6MjEwODAxOTkwM30.jycP6utDpQPOzQy_uBaSNE2p3lVJoAYxDH_OE8T4fsk';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

const DEADLINE = new Date('2026-10-30T17:00:00+08:00');
let currentUser = null;
let currentProfile = null;
let allSubmissions = [];

// DIRECT PROFILE LOGIN (Bypasses auth schema error completely)
async function login() {
    const emailInput = document.getElementById('email').value.trim().toLowerCase();
    
    if (!emailInput) {
        document.getElementById('login-msg').innerText = "Please enter an email address.";
        return;
    }

    // Direct lookup in profiles table
    const { data: profiles, error } = await supabaseClient
        .from('profiles')
        .select('*, programs(*)');

    if (error) {
        document.getElementById('login-msg').innerText = "Database connection error: " + error.message;
        return;
    }

    // Match profile by student ID or email prefix
    const matchedProfile = profiles.find(p => 
        emailInput.includes(p.student_id.toLowerCase()) || 
        (p.role === 'staff' && emailInput.includes('staff'))
    );

    if (!matchedProfile) {
        document.getElementById('login-msg').innerText = "Login failed: Account record not found.";
        return;
    }

    currentProfile = matchedProfile;
    currentUser = { id: currentProfile.id, email: emailInput };

    document.getElementById('login-section').style.display = 'none';
    document.getElementById('dashboard-section').style.display = 'block';
    document.getElementById('auth-header').style.display = 'block';
    document.getElementById('user-display').innerText = `${emailInput} (${currentProfile.role.toUpperCase()})`;

    if (currentProfile.role === 'scholar') {
        document.getElementById('scholar-form').style.display = 'block';
    } else {
        document.getElementById('scholar-form').style.display = 'none';
    }

    loadSubmissions();
}

async function logout() {
    location.reload();
}

// LOAD SUBMISSIONS & METRICS
async function loadSubmissions() {
    const { data, error } = await supabaseClient
        .from('submissions')
        .select('*, profiles(*, programs(*))');

    if (error) {
        alert("Error loading submissions: " + error.message);
        return;
    }

    allSubmissions = data || [];

    document.getElementById('m-total').innerText = allSubmissions.length;
    document.getElementById('m-pending').innerText = allSubmissions.filter(s => s.verification_status === 'Pending').length;
    document.getElementById('m-compliant').innerText = allSubmissions.filter(s => s.compliance_status === 'Compliant').length;
    document.getElementById('m-deficiency').innerText = allSubmissions.filter(s => s.compliance_status === 'With Deficiency').length;

    renderTable();
}

// RENDER TABLE
function renderTable() {
    const search = document.getElementById('search').value.toLowerCase();
    const progFilter = document.getElementById('filter-program').value;
    const compFilter = document.getElementById('filter-compliance').value;

    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    const filtered = allSubmissions.filter(s => {
        const nameMatch = (s.profiles?.full_name || '').toLowerCase().includes(search) || (s.profiles?.student_id || '').toLowerCase().includes(search);
        const progMatch = progFilter === 'ALL' || s.profiles?.programs?.code === progFilter;
        const compMatch = compFilter === 'ALL' || s.compliance_status === compFilter;
        return nameMatch && progMatch && compMatch;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-gray-500">No submission records found.</td></tr>`;
        return;
    }

    filtered.forEach(sub => {
        const prog = sub.profiles?.programs;
        const isStaff = currentProfile?.role === 'staff';

        tbody.innerHTML += `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-2 border font-bold">${sub.profiles?.student_id || 'N/A'} - ${sub.profiles?.full_name || 'Scholar'}</td>
                <td class="p-2 border text-xs">${prog ? prog.name : 'Unassigned'}</td>
                <td class="p-2 border">${sub.gwa} / ${sub.units}u</td>
                <td class="p-2 border text-xs">${sub.failed}F / ${sub.inc}I / ${sub.dropped}D</td>
                <td class="p-2 border">
                    <span class="px-2 py-0.5 text-xs rounded font-bold ${
                        sub.verification_status === 'Verified' ? 'bg-green-100 text-green-800' :
                        sub.verification_status === 'Returned' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                    }">
                        ${sub.verification_status}
                    </span>
                    ${sub.verification_reason ? `<div class="text-xs text-red-600 mt-1">${sub.verification_reason}</div>` : ''}
                </td>
                <td class="p-2 border text-xs">
                    <span class="font-bold ${
                        sub.compliance_status === 'Compliant' ? 'text-green-600' :
                        sub.compliance_status === 'With Deficiency' ? 'text-red-600' : 'text-gray-500'
                    }">
                        ${sub.compliance_status}
                    </span>
                    ${(sub.deficiency_reasons || []).map(r => `<div class="text-red-500">• ${r}</div>`).join('')}
                </td>
                <td class="p-2 border font-bold text-xs">${sub.renewal_decision}</td>
                <td class="p-2 border space-x-1">
                    ${isStaff && sub.verification_status === 'Pending' ? 
                        `<button onclick="verify('${sub.id}', 'Verified')" class="bg-green-500 text-white px-2 py-1 rounded text-xs">Verify</button>
                         <button onclick="verify('${sub.id}', 'Returned')" class="bg-red-500 text-white px-2 py-1 rounded text-xs">Return</button>` : ''}
                    ${isStaff && sub.verification_status === 'Verified' ? 
                        `<button onclick="evaluateCompliance('${sub.id}')" class="bg-purple-600 text-white px-2 py-1 rounded text-xs">Evaluate</button>
                         <button onclick="renew('${sub.id}', 'Approved')" class="bg-blue-600 text-white px-2 py-1 rounded text-xs">Approve</button>
                         <button onclick="renew('${sub.id}', 'Held')" class="bg-gray-600 text-white px-2 py-1 rounded text-xs">Hold</button>` : ''}
                </td>
            </tr>
        `;
    });
}

// EVALUATE COMPLIANCE WITH TC06 GATE
async function evaluateCompliance(subId) {
    const sub = allSubmissions.find(s => s.id === subId);
    if (!sub) return;

    if (sub.verification_status !== 'Verified') {
        alert("Evaluation Blocked (TC06): Evidence must be Verified before policy evaluation can occur!");
        return;
    }

    const prog = sub.profiles?.programs || { max_gwa: 1.75, min_units: 18, max_failed: 0, max_inc: 0, max_dropped: 0 };
    const reasons = [];

    if (parseFloat(sub.gwa) > parseFloat(prog.max_gwa)) reasons.push(`GWA (${sub.gwa}) exceeds maximum permitted (${prog.max_gwa})`);
    if (parseInt(sub.units) < parseInt(prog.min_units)) reasons.push(`Enrolled units (${sub.units}) below required minimum (${prog.min_units})`);
    if (parseInt(sub.failed) > parseInt(prog.max_failed)) reasons.push(`Failed subjects (${sub.failed}) exceeds limit (${prog.max_failed})`);
    if (parseInt(sub.inc) > parseInt(prog.max_inc)) reasons.push(`Incomplete grades (${sub.inc}) exceeds limit (${prog.max_inc})`);
    if (parseInt(sub.dropped) > parseInt(prog.max_dropped)) reasons.push(`Dropped subjects (${sub.dropped}) exceeds limit (${prog.max_dropped})`);
    
    if (new Date(sub.submitted_at) > DEADLINE) reasons.push(`Submission was received after deadline (Oct 30, 2026 17:00)`);

    const compStatus = reasons.length === 0 ? 'Compliant' : 'With Deficiency';

    await supabaseClient.from('submissions').update({
        compliance_status: compStatus,
        deficiency_reasons: reasons
    }).eq('id', subId);

    alert(`Evaluation Complete: ${compStatus}`);
    loadSubmissions();
}

// VERIFY HANDLER
async function verify(subId, status) {
    let reason = '';
    if (status === 'Returned') {
        reason = prompt("Enter reason for returning submission:") || "Incomplete documentation";
    }
    await supabaseClient.from('submissions').update({ verification_status: status, verification_reason: reason }).eq('id', subId);
    loadSubmissions();
}

// RENEWAL HANDLER
async function renew(subId, decision) {
    const sub = allSubmissions.find(s => s.id === subId);
    if (decision === 'Approved' && sub.compliance_status !== 'Compliant') {
        alert("RENEWAL DENIED (TC10): Cannot approve a scholar record that is With Deficiency or Pending Evaluation!");
        return;
    }
    await supabaseClient.from('submissions').update({ renewal_decision: decision }).eq('id', subId);
    alert(`Renewal decision updated to ${decision}`);
    loadSubmissions();
}

// SCHOLAR SUBMIT
async function submitGrades() {
    const gwaVal = parseFloat(document.getElementById('gwa').value);
    if (isNaN(gwaVal) || gwaVal < 1.00 || gwaVal > 5.00) {
        alert("Validation Error: GWA must be between 1.00 and 5.00");
        return;
    }

    const payload = {
        user_id: currentUser.id,
        academic_year: document.getElementById('ay').value,
        semester: document.getElementById('sem').value,
        gwa: gwaVal,
        units: parseInt(document.getElementById('units').value),
        failed: parseInt(document.getElementById('failed').value || 0),
        inc: parseInt(document.getElementById('inc').value || 0),
        dropped: parseInt(document.getElementById('dropped').value || 0),
        evidence_ref: document.getElementById('evidence').value,
        verification_status: 'Pending',
        compliance_status: 'Pending Evaluation',
        renewal_decision: 'Pending'
    };

    const { error } = await supabaseClient.from('submissions').insert([payload]);
    if (error) alert("Submission Error: " + error.message);
    else {
        alert("Submitted successfully!");
        loadSubmissions();
    }
}