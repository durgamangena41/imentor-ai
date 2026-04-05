// server/services/s3Service.js
const { v4: uuidv4 } = require('uuid');

const S3_BUCKET = process.env.S3_BUCKET_NAME;
const AWS_REGION = process.env.AWS_REGION;
const ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

// Check if AWS is configured properly (not placeholders/empty)
const isAwsConfigured = 
    ACCESS_KEY_ID && 
    SECRET_ACCESS_KEY && 
    ACCESS_KEY_ID !== "ADD_YOUR_AWS_ACCESS_KEY_ID_HERE" && 
    !ACCESS_KEY_ID.includes("ADD_YOUR") &&
    SECRET_ACCESS_KEY !== "ADD_YOUR_AWS_SECRET_ACCESS_KEY_HERE";

let s3;
let AWS;

if (isAwsConfigured) {
    try {
        // Only require aws-sdk if we intend to use it
        AWS = require('aws-sdk');
        
        // Configure the AWS SDK
        AWS.config.update({
            region: AWS_REGION,
            accessKeyId: ACCESS_KEY_ID,
            secretAccessKey: SECRET_ACCESS_KEY,
        });

        s3 = new AWS.S3({
            signatureVersion: 'v4',
        });
        console.log("✓ AWS S3 Service initialized.");
    } catch (err) {
        console.warn("! Failed to load AWS SDK:", err.message);
    }
} else {
    console.warn("! AWS Credentials not found or are placeholders. S3 features will be MOCKED (Bypassed) for development.");
}

async function getSignedUploadUrl(fileName, fileType) {
    if (!s3) {
        console.log(`[S3 Mock] Generating mock upload URL for ${fileName}`);
        return { 
            url: "http://localhost:5001/mock-s3-upload", // Dummy URL
            key: `datasets/mock-${uuidv4()}-${fileName}` 
        };
    }

    const key = `datasets/${uuidv4()}-${fileName}`;
    const params = {
        Bucket: S3_BUCKET,
        Key: key,
        Expires: 120, // URL expires in 2 minutes
        ContentType: fileType,
    };

    const url = await s3.getSignedUrlPromise('putObject', params);
    return { url, key };
}

async function getSignedDownloadUrl(key, originalName) {
    if (!s3) {
        console.log(`[S3 Mock] Generating mock download URL for ${key}`);
        return "http://localhost:5001/mock-s3-download"; // Dummy URL
    }

    const params = {
        Bucket: S3_BUCKET,
        Key: key,
        Expires: 120, // URL expires in 2 minutes
        ResponseContentDisposition: `attachment; filename="${originalName}"`,
    };

    const url = await s3.getSignedUrlPromise('getObject', params);
    return url;
}

async function deleteObjectFromS3(key) {
    if (!s3) {
        console.log(`[S3 Mock] Mock deletion of object with key: ${key}`);
        return { success: true };
    }

    const params = {
        Bucket: S3_BUCKET,
        Key: key,
    };

    try {
        await s3.deleteObject(params).promise();
        console.log(`[S3 Service] Successfully deleted object with key: ${key}`);
        return { success: true };
    } catch (error) {
        console.error(`[S3 Service] Error deleting object with key ${key}:`, error);
        // We throw so the caller knows it failed, but in a real app you might handle specific AWS errors
        throw new Error(`Failed to delete file from S3: ${error.message}`);
    }
}

module.exports = {
    getSignedUploadUrl,
    getSignedDownloadUrl,
    deleteObjectFromS3,
};
